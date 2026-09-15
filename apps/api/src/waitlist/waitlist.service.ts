import { createHash, randomBytes } from "node:crypto";
import { appUrl, workspaceRoleOf } from "@crm/auth";
import type { Db } from "@crm/db";
import { rateWindowKey } from "@crm/db/tracking";
import {
	ForbiddenException,
	HttpException,
	HttpStatus,
	Inject,
	Injectable,
	Logger,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { TrackingCounterService } from "../tracking/tracking-counter.service";
import { WAITLIST } from "./waitlist-config";

export function waitlistOpen(): boolean {
	return Boolean(
		process.env.RESEND_API_KEY?.trim() &&
			process.env.WAITLIST_FROM_EMAIL?.trim(),
	);
}

export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class WaitlistService {
	private readonly logger = new Logger(WaitlistService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(TrackingCounterService)
		private readonly counters: TrackingCounterService,
	) {}

	status() {
		return { open: waitlistOpen() };
	}

	async join(email: string): Promise<void> {
		if (!waitlistOpen()) return;

		const allowed = await this.counters.take(
			`${rateWindowKey()}:waitlist-join`,
			WAITLIST.join.perMinute,
		);
		if (!allowed) return;

		const existing = await this.db.waitlistSignup.findUnique({
			where: { email },
		});
		if (existing?.confirmedAt) return;
		if (
			existing &&
			Date.now() - existing.createdAt.getTime() < WAITLIST.join.resendAfterMs
		) {
			return;
		}

		const token = randomBytes(WAITLIST.token.bytes).toString("base64url");
		const tokenHash = hashToken(token);

		await this.db.waitlistSignup.upsert({
			where: { email },
			create: { email, tokenHash },
			update: { tokenHash, createdAt: new Date() },
		});

		await this.send(email, token);
	}

	async confirm(token: string): Promise<{ confirmed: boolean }> {
		const allowed = await this.counters.take(
			`${rateWindowKey()}:waitlist-confirm`,
			WAITLIST.confirm.perMinute,
		);
		if (!allowed) {
			throw new HttpException(
				"Too many confirmations right now. Try the link again in a minute.",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		const row = await this.db.waitlistSignup.findUnique({
			where: { tokenHash: hashToken(token) },
			select: { id: true, confirmedAt: true, createdAt: true },
		});
		if (!row) return { confirmed: false };
		if (
			!row.confirmedAt &&
			Date.now() - row.createdAt.getTime() > WAITLIST.token.maxAgeMs
		) {
			return { confirmed: false };
		}

		if (!row.confirmedAt) {
			await this.db.waitlistSignup.update({
				where: { id: row.id },
				data: { confirmedAt: new Date() },
			});
		}

		return { confirmed: true };
	}

	async list(userId: string) {
		if ((await workspaceRoleOf(userId, this.db)) !== "owner") {
			throw new ForbiddenException("Only a workspace owner sees the waitlist.");
		}

		const rows = await this.db.waitlistSignup.findMany({
			orderBy: { createdAt: "desc" },
			select: { email: true, createdAt: true, confirmedAt: true },
		});

		return {
			rows: rows.map((row) => ({
				email: row.email,
				createdAt: row.createdAt.toISOString(),
				confirmedAt: row.confirmedAt?.toISOString() ?? null,
			})),
		};
	}

	private async send(email: string, token: string): Promise<void> {
		const link = `${appUrl}/waitlist/confirm?token=${token}`;

		try {
			const response = await fetch(WAITLIST.email.endpoint, {
				method: "POST",
				headers: {
					authorization: `Bearer ${process.env.RESEND_API_KEY}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					from: process.env.WAITLIST_FROM_EMAIL,
					to: [email],
					subject: WAITLIST.email.subject,
					text: `Confirm that you want to hear when Reloop CRM Cloud opens:\n\n${link}\n\nIf you did not ask for this, ignore this email. Nothing happens without the click.`,
				}),
				signal: AbortSignal.timeout(WAITLIST.email.timeoutMs),
			});

			if (!response.ok) {
				this.logger.warn({
					message: "Waitlist confirmation email was refused",
					status: response.status,
				});
			}
		} catch (error) {
			this.logger.error(
				{ message: "Waitlist confirmation email could not be sent" },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}
}
