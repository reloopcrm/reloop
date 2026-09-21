import type { Db, Prisma } from "@crm/db";
import { clampImportSince, limitsOf } from "@crm/db/plans";
import { readPlan } from "@crm/db/settings";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { imapSourceFor } from "../mailbox/mailbox.constants";
import {
	mailboxLimitMessage,
	SyncStateService,
} from "../mailbox/sync-state.service";
import { rebuildThreads } from "../mailbox/thread-rebuild";
import { ImapClientFactory } from "./imap.client";
import { IMAP } from "./imap.config";
import type {
	AddImapAccountInput,
	ImapAccountOutput,
	ImapCreateFrom,
	ImapPurgeOutput,
	ImapRemoveOutput,
	ImapStatus,
} from "./imap.contracts";
import { ImapCredentialService } from "./imap-credentials";
import { backlogOf, parseImapCursor } from "./imap-cursor";

type ImapCreatePolicy = {
	autoCreate: boolean;
	createWithoutReply: boolean;
	createFrom: ImapCreateFrom;
};

@Injectable()
export class ImapConnectionService {
	private readonly logger = new Logger(ImapConnectionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly clients: ImapClientFactory,
		private readonly credentials: ImapCredentialService,
		private readonly state: SyncStateService,
		private readonly stamp: ActivityStampService,
	) {}

	async status(userId: string): Promise<ImapStatus> {
		const accounts = await this.db.imapAccount.findMany({
			where: { userId },
			orderBy: { createdAt: "asc" },
		});

		if (accounts.length === 0) return { linked: false, accounts: [] };

		const [rows, counts] = await Promise.all([
			this.state.listForUser(
				userId,
				accounts.map((account) => imapSourceFor(account.id)),
			),
			this.db.emailMessage.groupBy({
				by: ["imapAccountId"],
				where: { imapAccountId: { in: accounts.map((account) => account.id) } },
				_count: { _all: true },
			}),
		]);

		const bySource = new Map(rows.map((row) => [row.source, row]));
		const messagesByAccount = new Map(
			counts.map((entry) => [entry.imapAccountId, entry._count._all]),
		);

		return {
			linked: true,
			accounts: accounts.map((account): ImapAccountOutput => {
				const row = bySource.get(imapSourceFor(account.id));

				return {
					id: account.id,
					email: account.email,
					host: account.host,
					port: account.port,
					secure: account.secure,
					username: account.username,
					importSince: account.importSince?.toISOString() ?? null,
					status: row?.status ?? null,
					lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
					lastError: row?.lastError ?? null,
					createFrom: createFromOf(row),
					backlog: row ? backlogOf(parseImapCursor(row.cursor)) : 0,
					messages: messagesByAccount.get(account.id) ?? 0,
					createdAt: account.createdAt.toISOString(),
				};
			}),
		};
	}

	async add(userId: string, input: AddImapAccountInput): Promise<ImapStatus> {
		const email = input.email.toLowerCase();

		const existing = await this.db.imapAccount.findUnique({
			where: { userId_email: { userId, email } },
			select: { id: true },
		});
		if (existing) {
			throw new BadRequestException(`${email} is already connected.`);
		}

		const limits = limitsOf(await readPlan(this.db));

		const reached = await this.state.mailboxLimitReached();
		if (reached) throw new BadRequestException(mailboxLimitMessage(reached));

		const importSince = clampImportSince(
			input.importSince ? new Date(input.importSince) : null,
			limits,
			new Date(),
		);

		const connected = await this.clients.connect({
			host: input.host,
			port: input.port,
			secure: input.secure,
			username: input.username,
			password: input.password,
		});

		if (connected.outcome !== "ok") {
			throw new BadRequestException(connected.reason);
		}

		await connected.session.close();

		const account = await this.db.imapAccount.create({
			data: {
				userId,
				email,
				host: input.host,
				port: input.port,
				secure: input.secure,
				username: input.username,
				secret: this.credentials.seal(input.password),
				importSince,
			},
			select: { id: true },
		});

		await this.state.ensure(
			userId,
			imapSourceFor(account.id),
			policyOf(input.createFrom),
		);

		this.logger.log({
			message: "IMAP mailbox connected",
			userId,
			accountId: account.id,
		});

		return this.status(userId);
	}

	async reconcileAll(): Promise<void> {
		const accounts = await this.db.imapAccount.findMany({
			select: { id: true, userId: true },
		});
		if (accounts.length === 0) return;

		const rows = await this.db.mailboxSync.findMany({
			where: { source: { startsWith: "imap:" } },
			select: { source: true },
		});
		const known = new Set(rows.map((row) => row.source));

		for (const account of accounts) {
			const source = imapSourceFor(account.id);
			if (known.has(source)) continue;

			await this.state.ensure(account.userId, source, policyOf("relevant"));
		}
	}

	async setCreateFrom(
		userId: string,
		id: string,
		createFrom: ImapCreateFrom,
	): Promise<void> {
		await this.owned(userId, id);
		await this.state.setCreatePolicy(
			userId,
			imapSourceFor(id),
			policyOf(createFrom),
		);
	}

	async remove(userId: string, id: string): Promise<ImapRemoveOutput> {
		await this.owned(userId, id);

		await this.state.remove(userId, imapSourceFor(id));
		await this.db.imapAccount.delete({ where: { id } });

		this.logger.log({ message: "IMAP mailbox removed", userId, accountId: id });

		return { removed: true };
	}

	async purgeSyncedData(userId: string, id: string): Promise<ImapPurgeOutput> {
		await this.owned(userId, id);

		const mine: Prisma.EmailMessageWhereInput = {
			syncedByUserId: userId,
			imapAccountId: id,
		};

		const purged = await this.db.$transaction(
			async (tx) => {
				const touched = await tx.emailMessage.findMany({
					where: mine,
					select: { threadId: true },
					distinct: ["threadId"],
				});

				const threadIds = touched.map((row) => row.threadId);
				const messages = await tx.emailMessage.deleteMany({ where: mine });

				await tx.emailThread.deleteMany({
					where: { id: { in: threadIds }, messages: { none: {} } },
				});

				await rebuildThreads(tx, threadIds);

				return messages.count;
			},
			{ timeout: IMAP.purge.timeoutMs },
		);

		await this.db.mailboxSync.updateMany({
			where: { userId, source: imapSourceFor(id) },
			data: { cursor: null },
		});

		await this.stamp.recomputeAll();

		this.logger.log({
			message: "IMAP data purged",
			userId,
			accountId: id,
			purged,
		});

		return { purged };
	}

	private async owned(userId: string, id: string): Promise<void> {
		const account = await this.db.imapAccount.findUnique({
			where: { id },
			select: { userId: true },
		});

		if (!account || account.userId !== userId) {
			throw new NotFoundException("That mailbox is not connected.");
		}
	}
}

function policyOf(createFrom: ImapCreateFrom): ImapCreatePolicy {
	return {
		autoCreate: createFrom === "everyone" || createFrom === "replied",
		createWithoutReply: createFrom === "everyone",
		createFrom,
	};
}

function createFromOf(
	row:
		| {
				autoCreate: boolean;
				createWithoutReply: boolean;
				createFrom: string | null;
		  }
		| undefined,
): ImapCreateFrom {
	if (!row) return "nobody";
	if (row.createFrom === "relevant") return "relevant";
	if (!row.autoCreate) return "nobody";
	return row.createWithoutReply ? "everyone" : "replied";
}
