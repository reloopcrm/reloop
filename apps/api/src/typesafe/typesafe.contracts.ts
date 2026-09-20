import { TYPESAFE } from "@crm/db/typesafe";
import { z } from "zod";

export const typesafeStatusOutput = z.object({
	connected: z.boolean(),
	keyHint: z.string().nullable(),
	canManage: z.boolean(),
});

export const saveTypesafeKeyInput = z.object({
	apiKey: z
		.string()
		.trim()
		.min(TYPESAFE.key.minLength)
		.max(TYPESAFE.key.maxLength),
});

export type TypesafeStatus = z.infer<typeof typesafeStatusOutput>;
export type SaveTypesafeKeyInput = z.infer<typeof saveTypesafeKeyInput>;
