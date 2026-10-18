import type { Db } from "@crm/db";
import type { DealStageNames } from "@crm/db/deal-stage";
import {
	readMetadataValue,
	WORKSPACE_ID,
	writeMetadataValue,
} from "@crm/db/workspace";
import { z } from "zod";

export const DEAL_STAGE_NAME_MAX = 40;

export const DEAL_STAGE_NAMES_KEY = "dealStageNames";

const stageName = z.string().trim().min(1).max(DEAL_STAGE_NAME_MAX).optional();

export const dealStageNames = z.object({
	DEMO_BOOKED: stageName,
	QUALIFIED_TO_BUY: stageName,
	DECISION_MAKER_BOUGHT_IN: stageName,
	CONTRACT_SENT: stageName,
	CLOSED_WON: stageName,
	CLOSED_LOST: stageName,
	UNQUALIFIED_TO_BUY: stageName,
}) satisfies z.ZodType<DealStageNames>;

export type { DealStageNames };

export function parseDealStageNames(value: unknown): DealStageNames {
	if (value === null || value === undefined) return {};

	const parsed = dealStageNames.safeParse(value);
	return parsed.success ? parsed.data : {};
}

export async function readDealStageNames(db: Db): Promise<DealStageNames> {
	const row = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { metadata: true },
	});

	return parseDealStageNames(
		readMetadataValue(row?.metadata ?? null, DEAL_STAGE_NAMES_KEY),
	);
}

export async function writeDealStageNames(
	db: Db,
	names: DealStageNames,
): Promise<DealStageNames> {
	const clean = dealStageNames.parse(names);

	const row = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { metadata: true },
	});

	await db.organization.update({
		where: { id: WORKSPACE_ID },
		data: {
			metadata: writeMetadataValue(
				row?.metadata ?? null,
				DEAL_STAGE_NAMES_KEY,
				clean,
			),
		},
	});

	return clean;
}
