import { onSignedIn } from "@crm/auth";
import { type Db, EnrichmentStatus, type Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { NOT_SAMPLE_RECORD } from "@crm/db/sample-data";
import { holdTenant, tenantScopedKey } from "@crm/db/tenant-context";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { FaviconService } from "../companies/favicon.service";
import { InjectDatabase } from "../database/database.constants";
import { ImageMirrorService } from "./image-mirror.service";

export type BackfillScope = "companies" | "contacts" | "deals";

export type BackfillResult = {
	queued: number;
	alreadyQueued: number;
	remaining: number;
	iconsResolving: number;
};

const MAX_PER_RUN = 500;

const MAX_FAVICONS = 25;

const NEVER_SUCCEEDED: Prisma.EnumEnrichmentStatusFilter = {
	in: [EnrichmentStatus.PENDING, EnrichmentStatus.FAILED],
};

const AUTO_KEY = "backfill:auto";

const AUTO_EVERY_MS = 5 * 60_000;

/**
 * How long a fruitless photo search stands the contact down for.
 *
 * Long, because the answer rarely changes: somebody with no LinkedIn account
 * and no headshot on their employer's site is unlikely to acquire either this
 * week, and the team-page read costs credits every time it is asked.
 */
const RECHECK_PHOTO_AFTER_MS = 30 * 24 * 60 * 60_000;

const RECHECK_BRAND_AFTER_MS = 30 * 24 * 60 * 60_000;

const RECHECK_WORKSPACE_AFTER_MS = 7 * 24 * 60 * 60_000;

@Injectable()
export class BackfillService implements OnModuleInit {
	private readonly logger = new Logger(BackfillService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly favicon: FaviconService,
		private readonly images: ImageMirrorService,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	onModuleInit(): void {
		onSignedIn(() => {
			void this.auto();
		});
	}

	async auto(): Promise<{ started: boolean }> {
		const key = tenantScopedKey(AUTO_KEY);
		if (await this.cache.get(key)) return { started: false };
		await this.cache.set(key, true, AUTO_EVERY_MS);

		void holdTenant(async () => {
			try {
				await this.sweepWorkspace();

				const companies = await this.runCompanies(false);
				const contacts = await this.runContacts();

				const mirrored = await this.images.sweep();

				this.logger.log({
					message: "Automatic backfill swept",
					queued: companies.queued + contacts.queued,
					remaining: companies.remaining + contacts.remaining,
					iconsResolving: companies.iconsResolving,
					imagesMirrored: mirrored.copied,
				});
			} catch (error) {
				this.logger.error(
					{ message: "Automatic backfill failed" },
					error instanceof Error ? error.stack : String(error),
				);
			}
		});

		return { started: true };
	}

	private async sweepWorkspace(): Promise<void> {
		const us = await readWorkspaceIdentity(this.db);

		if (!us?.website || us.profile) return;

		const attempted = await this.db.agentTask.findFirst({
			where: {
				kind: "workspace-profile",
				finishedAt: { gte: new Date(Date.now() - RECHECK_WORKSPACE_AFTER_MS) },
			},
			select: { id: true },
		});

		if (attempted) return;

		await this.agent.workspaceChanged(
			us.website,
			"We still have no profile of the company using this CRM",
		);
	}

	async run(scope: BackfillScope): Promise<BackfillResult> {
		if (scope === "contacts") return this.runContacts();

		return this.runCompanies(scope === "deals");
	}

	private async runCompanies(dealsOnly: boolean): Promise<BackfillResult> {
		const onDeals: Prisma.CompanyWhereInput = dealsOnly
			? { deals: { some: {} } }
			: {};

		const needsBrand = this.companiesNeedingBrand();
		const needsArtwork = await this.companiesNeedingArtwork();

		const [total, rows, artworkRows] = await Promise.all([
			this.db.company.count({
				where: { ...onDeals, OR: [needsBrand, needsArtwork] },
			}),
			this.db.company.findMany({
				where: { ...needsBrand, ...onDeals },
				orderBy: { createdAt: "asc" },
				take: MAX_PER_RUN,
				select: { id: true },
			}),
			this.db.company.findMany({
				where: { ...needsArtwork, ...onDeals },
				orderBy: { createdAt: "asc" },
				take: MAX_PER_RUN,
				select: { id: true },
			}),
		]);

		const companyIds = [
			...new Set([
				...rows.map((row) => row.id),
				...artworkRows.map((row) => row.id),
			]),
		].slice(0, MAX_PER_RUN);

		const brand = await this.agent.backfill({
			kind: "brand",
			reason: "Backfill — this company has no logo or icon",
			companyIds,
			budget: 2,
			priority: PRIORITY.brand,
		});

		const profile = await this.agent.backfill({
			kind: "company-profile",
			reason: "Backfill — this company was never successfully looked up",
			companyIds: rows.map((row) => row.id),
		});

		const queued = {
			queued: brand.queued + profile.queued,
			alreadyQueued: brand.alreadyQueued + profile.alreadyQueued,
		};

		const iconsResolving = dealsOnly ? 0 : await this.sweepFavicons();

		return {
			...queued,
			remaining: Math.max(0, total - companyIds.length),
			iconsResolving,
		};
	}

	private async runContacts(): Promise<BackfillResult> {
		const needsPhoto = await this.contactsNeedingPhoto();

		const [photoTotal, photoRows] = await Promise.all([
			this.db.contact.count({ where: needsPhoto }),
			this.db.contact.findMany({
				where: needsPhoto,
				orderBy: { createdAt: "asc" },
				take: MAX_PER_RUN,
				select: { id: true },
			}),
		]);

		const photos = await this.agent.backfill({
			kind: "portrait",
			reason: "Backfill — somewhere to look for a picture, and no picture",
			contactIds: photoRows.map((row) => row.id),
			budget: 1,
			priority: PRIORITY.portrait,
		});

		const headroom = MAX_PER_RUN - photoRows.length;

		const [researchTotal, researchRows] = await Promise.all([
			this.db.contact.count({ where: this.contactsNeverResearched() }),
			headroom > 0
				? this.db.contact.findMany({
						where: this.contactsNeverResearched(),
						orderBy: { createdAt: "asc" },
						take: headroom,
						select: { id: true },
					})
				: Promise.resolve([]),
		]);

		const research = await this.agent.backfill({
			kind: "identify",
			reason: "Backfill — this contact was never researched",
			contactIds: researchRows.map((row) => row.id),
		});

		return {
			queued: photos.queued + research.queued,
			alreadyQueued: photos.alreadyQueued + research.alreadyQueued,
			remaining:
				Math.max(0, photoTotal - photoRows.length) +
				Math.max(0, researchTotal - researchRows.length),
			iconsResolving: 0,
		};
	}

	private async sweepFavicons(): Promise<number> {
		const rows = await this.db.company.findMany({
			where: { ...NOT_SAMPLE_RECORD, domain: { not: null }, iconUrl: null },
			orderBy: { createdAt: "asc" },
			take: MAX_FAVICONS,
			select: { id: true, domain: true },
		});

		if (rows.length === 0) return 0;

		void holdTenant(async () => {
			let resolved = 0;
			for (const row of rows) {
				if (await this.favicon.backfill(row.id, row.domain)) resolved += 1;
			}
			this.logger.log({
				message: "Favicon sweep finished",
				attempted: rows.length,
				resolved,
			});
		});

		return rows.length;
	}

	private companiesNeedingBrand(): Prisma.CompanyWhereInput {
		return {
			...NOT_SAMPLE_RECORD,
			domain: { not: null },
			enrichmentStatus: NEVER_SUCCEEDED,
		};
	}

	private async companiesNeedingArtwork(): Promise<Prisma.CompanyWhereInput> {
		const since = new Date(Date.now() - RECHECK_BRAND_AFTER_MS);

		const checked = await this.db.agentTask.findMany({
			where: { kind: "brand", finishedAt: { gte: since } },
			select: { companyId: true },
		});

		const recentlyChecked = checked
			.map((row) => row.companyId)
			.filter((id): id is string => id !== null);

		const where: Prisma.CompanyWhereInput = {
			...NOT_SAMPLE_RECORD,
			domain: { not: null },
			logoUrl: null,
			iconUrl: null,
		};
		if (recentlyChecked.length > 0) {
			where.id = { ...NOT_SAMPLE_RECORD.id, notIn: recentlyChecked };
		}

		return where;
	}

	/**
	 * Contacts with a face to fetch and nowhere it has been put yet.
	 *
	 * One door qualifies, matching the agent's chain: a GitHub URL. Reading a
	 * LinkedIn profile and reading an employer's team page both went with the
	 * Context.dev key, so queueing a contact on either would book work that can
	 * only report that it found nothing.
	 *
	 * The exclusion below stays load-bearing. A finished `portrait` task is the
	 * record that we looked; a month is long enough that a new GitHub account is
	 * still picked up eventually.
	 */
	private async contactsNeedingPhoto(): Promise<Prisma.ContactWhereInput> {
		const since = new Date(Date.now() - RECHECK_PHOTO_AFTER_MS);

		// `AgentTask.contactId` is a bare column with no Prisma relation, so this
		// cannot be a nested `some`. Two queries, and the id list is bounded by
		// the number of contacts we have already looked for.
		const checked = await this.db.agentTask.findMany({
			where: { kind: "portrait", finishedAt: { gte: since } },
			select: { contactId: true },
		});

		const recentlyChecked = checked
			.map((row) => row.contactId)
			.filter((id): id is string => id !== null);

		const where: Prisma.ContactWhereInput = {
			...NOT_SAMPLE_RECORD,
			imageUrl: null,
			githubUrl: { not: null },
		};
		if (recentlyChecked.length > 0) {
			where.id = { ...NOT_SAMPLE_RECORD.id, notIn: recentlyChecked };
		}

		return where;
	}

	private contactsNeverResearched(): Prisma.ContactWhereInput {
		return { ...NOT_SAMPLE_RECORD, enrichmentStatus: NEVER_SUCCEEDED };
	}
}
