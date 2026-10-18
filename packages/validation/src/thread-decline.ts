import { DECLINE_KINDS, type DeclineKind } from "@crm/db/insights";
import { z } from "zod";

export const declineKind = z.enum(DECLINE_KINDS);

export const storedDeclineKind = declineKind.nullable();

export function parseDeclineKind(value: unknown): DeclineKind | null {
	return storedDeclineKind.parse(value);
}
