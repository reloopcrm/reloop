import type { Db } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import { STORY_KIND } from "@crm/db/plans";
import {
	listReactivationCandidates,
	REACTIVATION,
	type ReactivationGroup,
} from "@crm/db/reactivation";
import {
	readAgentLanguage,
	type SummaryLanguage,
	summaryIsStale,
	summaryLanguage,
} from "@crm/validation/agent-language";
import { parsePersonStory } from "@crm/validation/person-story";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { PERSON_VIEW } from "./reactivation.config";
import type { ReactivationListInput } from "./reactivation.contracts";
import { WinBackDraftPrefetchService } from "./win-back-draft-prefetch.service";
import { sortGroups } from "./win-back-groups";

const PREFETCH_KEY = "win-back:story-prefetch";

const REASON = {
	top: "Prefetched: near the top of the Win back list",
	next: "Prefetched: the next person in Win back",
} as const;

const DRAFT_REASON = {
	top: "Prefetched email: near the top of the Win back list",
	next: "Prefetched email: the next person in Win back",
} as const;

export type StoryCheck = {
	story: {
		story: unknown;
		language: string | null;
		basedOnUntil: Date | null;
	} | null;
	newestAt: Date | null;
	open: boolean;
	lastFinishedAt: Date | null;
};

export function topOfList(
	groups: readonly ReactivationGroup[],
	top: number = PERSON_VIEW.prefetch.top,
): string[] {
	return sortGroups(groups, PERSON_VIEW.prefetch.sort, PERSON_VIEW.prefetch.dir)
		.flatMap((group) => group.people)
		.slice(0, top)
		.map((person) => person.contact.id);
}

export function needsStory(
	check: StoryCheck,
	wanted: SummaryLanguage,
	now: Date,
): boolean {
	if (check.open || check.newestAt === null) return false;

	const triedSince = Math.max(
		check.newestAt.getTime(),
		now.getTime() - PERSON_VIEW.retryAfterMs,
	);
	if (check.lastFinishedAt && check.lastFinishedAt.getTime() >= triedSince) {
		return false;
	}

	const row = check.story;
	if (!row) return true;

	return (
		!parsePersonStory(row.story).ok ||
		summaryIsStale(row.language, wanted) ||
		row.basedOnUntil === null ||
		check.newestAt > row.basedOnUntil
	);
}

export function readsDefaultList(
	input: Pick<
		ReactivationListInput,
		"rejected" | "replied" | "scope" | "quietForDays"
	>,
): boolean {
	return (
		!input.rejected &&
		!input.replied &&
		input.scope === "everyone" &&
		input.quietForDays === REACTIVATION.quietForDays.default
	);
}

@Injectable()
export class WinBackStoryPrefetchService {
	private readonly logger = new Logger(WinBackStoryPrefetchService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
		private readonly drafts: WinBackDraftPrefetchService,
	) {}

	listRead(groups: readonly ReactivationGroup[] | null): void {
		void cloud.hold(async () => {
			try {
				const key = cloud.scopedKey(PREFETCH_KEY);
				if (await this.cache.get(key)) return;
				await this.cache.set(key, true, PERSON_VIEW.prefetch.everyMs);

				const list = groups ?? (await this.defaultList());
				await this.queue(topOfList(list), REASON.top);
				await this.drafts.queue(
					topOfList(list, PERSON_VIEW.prefetch.drafts.top),
					DRAFT_REASON.top,
				);
			} catch (error) {
				this.logger.error(
					{ message: "The story prefetch for the list failed" },
					error instanceof Error ? error.stack : String(error),
				);
			}
		});
	}

	nextShown(contactId: string): void {
		void cloud.hold(async () => {
			try {
				await this.queue([contactId], REASON.next);
				await this.drafts.queue([contactId], DRAFT_REASON.next);
			} catch (error) {
				this.logger.error(
					{ message: "The story prefetch for the next person failed" },
					error instanceof Error ? error.stack : String(error),
				);
			}
		});
	}

	async queue(contactIds: readonly string[], reason: string): Promise<number> {
		const ids = [...new Set(contactIds)];
		if (ids.length === 0) return 0;

		const now = new Date();
		const [stories, newest, open, finished, language] = await Promise.all([
			this.db.contactStory.findMany({
				where: { contactId: { in: ids } },
				select: {
					contactId: true,
					story: true,
					language: true,
					basedOnUntil: true,
				},
			}),
			this.db.emailThread.groupBy({
				by: ["contactId"],
				where: { contactId: { in: ids } },
				_max: { lastMessageAt: true },
			}),
			this.db.agentTask.findMany({
				where: { kind: STORY_KIND, finishedAt: null, contactId: { in: ids } },
				select: { contactId: true },
			}),
			this.db.agentTask.groupBy({
				by: ["contactId"],
				where: {
					kind: STORY_KIND,
					finishedAt: { not: null },
					contactId: { in: ids },
				},
				_max: { finishedAt: true },
			}),
			readAgentLanguage(this.db),
		]);

		const wanted = summaryLanguage(language, process.env.RELOOP_GERMAN);
		const storyOf = new Map(stories.map((row) => [row.contactId, row]));
		const newestOf = new Map(
			newest.map((row) => [row.contactId, row._max.lastMessageAt]),
		);
		const openIds = new Set(open.map((row) => row.contactId));
		const finishedOf = new Map(
			finished.map((row) => [row.contactId, row._max.finishedAt]),
		);

		const wantedIds = ids.filter((id) =>
			needsStory(
				{
					story: storyOf.get(id) ?? null,
					newestAt: newestOf.get(id) ?? null,
					open: openIds.has(id),
					lastFinishedAt: finishedOf.get(id) ?? null,
				},
				wanted,
				now,
			),
		);

		return this.agent.personStoriesPrefetched(
			wantedIds,
			reason,
			PERSON_VIEW.prefetch.openShare,
		);
	}

	private async defaultList(): Promise<ReactivationGroup[]> {
		const report = await listReactivationCandidates(this.db, {
			rejected: false,
			quietForDays: REACTIVATION.quietForDays.default,
			limit: REACTIVATION.limit.max,
			ownerId: null,
			rules: await readWinBackRules(this.db),
		});

		return report.groups;
	}
}
