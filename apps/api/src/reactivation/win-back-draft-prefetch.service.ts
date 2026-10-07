import type { Db } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import { fixedAiWith } from "@crm/db/plan-usage";
import { DRAFT_KIND } from "@crm/db/plans";
import { readProviderUsage } from "@crm/db/provider-usage";
import { type AgentProviderSetting, readAgentProvider } from "@crm/db/settings";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { PERSON_VIEW } from "./reactivation.config";

const DRAFTS = PERSON_VIEW.prefetch.drafts;

export type DraftCheck = {
	hasDraft: boolean;
	hasAddress: boolean;
	newestAt: Date | null;
	open: boolean;
	lastFinishedAt: Date | null;
};

export function needsDraft(check: DraftCheck, now: Date): boolean {
	if (check.hasDraft || check.open || !check.hasAddress) return false;
	if (check.newestAt === null) return false;

	const triedSince = Math.max(
		check.newestAt.getTime(),
		now.getTime() - PERSON_VIEW.retryAfterMs,
	);
	return !(
		check.lastFinishedAt && check.lastFinishedAt.getTime() >= triedSince
	);
}

export function prefetchRoom(
	budget: number | null,
	used: number,
	prefetched: number,
): number {
	const capRoom = DRAFTS.perMonth - prefetched;
	if (budget === null) return capRoom;

	const ceiling = budget - Math.ceil(budget * DRAFTS.reserveShare);
	return Math.min(capRoom, ceiling - used);
}

export function draftsCanRun(
	setting: Pick<
		AgentProviderSetting,
		"openrouterKey" | "openaiKey" | "anthropicKey"
	>,
	context: {
		fixedAi: boolean;
		envKey: boolean;
		hosted: boolean;
		chatgptWorked: boolean;
	},
): boolean {
	if (context.fixedAi || context.chatgptWorked) return true;
	if (setting.openrouterKey || setting.openaiKey || setting.anthropicKey) {
		return true;
	}
	return context.envKey && !context.hosted;
}

@Injectable()
export class WinBackDraftPrefetchService {
	private readonly logger = new Logger(WinBackDraftPrefetchService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly config: ConfigService<EnvironmentVariables, true>,
	) {}

	async queue(contactIds: readonly string[], reason: string): Promise<number> {
		const ids = [...new Set(contactIds)];
		if (ids.length === 0) return 0;

		try {
			if (!(await this.canRun())) return 0;

			const now = new Date();
			const [addressed, drafts, newest, open, finished] = await Promise.all([
				this.db.contact.findMany({
					where: { id: { in: ids }, email: { not: null } },
					select: { id: true },
				}),
				this.db.emailDraft.findMany({
					where: { contactId: { in: ids } },
					select: { contactId: true },
				}),
				this.db.emailThread.groupBy({
					by: ["contactId"],
					where: { contactId: { in: ids } },
					_max: { lastMessageAt: true },
				}),
				this.db.agentTask.findMany({
					where: { kind: DRAFT_KIND, finishedAt: null, contactId: { in: ids } },
					select: { contactId: true },
				}),
				this.db.agentTask.groupBy({
					by: ["contactId"],
					where: {
						kind: DRAFT_KIND,
						finishedAt: { not: null },
						contactId: { in: ids },
					},
					_max: { finishedAt: true },
				}),
			]);

			const reachable = new Set(addressed.map((row) => row.id));
			const drafted = new Set(drafts.map((row) => row.contactId));
			const newestOf = new Map(
				newest.map((row) => [row.contactId, row._max.lastMessageAt]),
			);
			const openIds = new Set(open.map((row) => row.contactId));
			const finishedOf = new Map(
				finished.map((row) => [row.contactId, row._max.finishedAt]),
			);

			const wantedIds = ids.filter((id) =>
				needsDraft(
					{
						hasDraft: drafted.has(id),
						hasAddress: reachable.has(id),
						newestAt: newestOf.get(id) ?? null,
						open: openIds.has(id),
						lastFinishedAt: finishedOf.get(id) ?? null,
					},
					now,
				),
			);
			if (wantedIds.length === 0) return 0;

			return await this.agent.emailDraftsPrefetched(
				wantedIds,
				reason,
				prefetchRoom,
				now,
			);
		} catch (error) {
			this.logger.error(
				{ message: "The draft prefetch failed" },
				error instanceof Error ? error.stack : String(error),
			);
			return 0;
		}
	}

	private async canRun(): Promise<boolean> {
		const [setting, fixedAi, chatgpt] = await Promise.all([
			readAgentProvider(this.db),
			fixedAiWith(this.db),
			readProviderUsage(this.db, "chatgpt"),
		]);
		const ready = draftsCanRun(setting, {
			fixedAi,
			envKey: Boolean(
				this.config.get("OPENROUTER_API_KEY", { infer: true })?.trim(),
			),
			hosted: cloud.customer(),
			chatgptWorked: chatgpt !== null,
		});
		if (!ready) {
			this.logger.log({
				message: "Draft prefetch skipped: no AI provider is set up",
			});
		}
		return ready;
	}
}
