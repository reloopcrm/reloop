import type { Db } from "@crm/db";
import type { PlanLimits } from "@crm/db/plans";
import { NOT_SAMPLE_RECORD } from "@crm/db/sample-data";

export async function importCapReached(
	db: Db,
	limits: PlanLimits,
): Promise<boolean> {
	if (limits.importThreads === null) return false;
	const threads = await db.emailThread.count({ where: NOT_SAMPLE_RECORD });
	return threads >= limits.importThreads;
}
