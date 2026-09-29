import { describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import { readMonthlyUsage, usageWindowOf } from "../src/plan-usage";

const NOW = new Date("2026-11-02T12:00:00.000Z");
const MONTH_START = "2026-11-01T00:00:00.000Z";
const NEXT_MONTH = "2026-12-01T00:00:00.000Z";

function recordingDb(stored: string | null) {
	const since: Date[] = [];
	const fake = {
		appSetting: { findUnique: async () => ({ plan: stored }) },
		agentTask: {
			count: async ({ where }: { where: Record<string, { gte: Date }> }) => {
				const bound = where.createdAt ?? where.startedAt ?? where.finishedAt;
				if (bound) since.push(bound.gte);
				return 0;
			},
		},
		$queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
			since.push(values[0] as Date);
			return [{ count: 0n }];
		},
	};
	return { db: fake as unknown as Db, since };
}

const distinct = (dates: Date[]) => [
	...new Set(dates.map((date) => date.toISOString())),
];

describe("the usage window", () => {
	it("keeps the calendar month on a self-hosted install, outside any tenant", async () => {
		const { db, since } = recordingDb("trial");

		const window = await usageWindowOf(db, NOW);
		expect(window.since.toISOString()).toBe(MONTH_START);
		expect(window.until.toISOString()).toBe(NEXT_MONTH);

		await readMonthlyUsage(db, NOW);
		expect(distinct(since)).toEqual([MONTH_START]);
	});
});
