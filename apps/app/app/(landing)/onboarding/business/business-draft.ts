import { BUSINESS_DRAFT } from "@crm/db/win-back-rules";
import {
	BUSINESS_STEP,
	type BusinessDraftSource,
	businessDraftPossible,
} from "./business-config";

export type BusinessDraftMaterial = { threads: number; website: boolean };

export function hasDraftMaterial(material: BusinessDraftMaterial): boolean {
	return material.website || material.threads >= BUSINESS_DRAFT.minThreads;
}

export async function answeredWithin(
	check: () => Promise<boolean>,
	timeoutMs: number,
): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<boolean>((resolve) => {
		timer = setTimeout(() => resolve(false), timeoutMs);
	});

	try {
		return await Promise.race([check(), late]);
	} finally {
		clearTimeout(timer);
	}
}

export async function businessDraftExpected(input: {
	model: Omit<BusinessDraftSource, "chatgpt">;
	material: BusinessDraftMaterial;
	chatgpt: () => Promise<boolean>;
}): Promise<boolean> {
	if (!hasDraftMaterial(input.material)) return false;
	if (businessDraftPossible({ ...input.model, chatgpt: false })) return true;

	return answeredWithin(input.chatgpt, BUSINESS_STEP.loginCheckMs);
}
