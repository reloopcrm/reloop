import type { Db } from "@crm/db";
import type { PlanLimits } from "@crm/db/plans";
import { NOT_SAMPLE_RECORD } from "@crm/db/sample-data";

export async function importCapRemaining(
	db: Db,
	limits: PlanLimits,
): Promise<number> {
	if (limits.importThreads === null) return Number.POSITIVE_INFINITY;
	const threads = await db.emailThread.count({ where: NOT_SAMPLE_RECORD });
	return Math.max(limits.importThreads - threads, 0);
}
