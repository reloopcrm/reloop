import { FIELD_ENTITIES } from "@crm/db/fields-shape";
import { z } from "zod";

export const FIELD_PROPOSAL_KIND = "field-proposal";

export const PROPOSABLE_FIELD_TYPES = [
	"TEXT",
	"LONG_TEXT",
	"NUMBER",
	"DATE",
	"CHECKBOX",
	"SELECT",
	"URL",
	"EMAIL",
	"PHONE",
] as const;

export type ProposableFieldType = (typeof PROPOSABLE_FIELD_TYPES)[number];

export const fieldProposalPayload = z.object({
	entity: z.enum(FIELD_ENTITIES),
	key: z.string().trim().min(1).max(60),
	label: z.string().trim().min(1).max(60),
	type: z.enum(PROPOSABLE_FIELD_TYPES),
	options: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
	agentBrief: z.string().trim().min(1).max(400),
	seen: z.number().int().min(0).max(100_000),
});

export type FieldProposalPayload = z.infer<typeof fieldProposalPayload>;

export function parseFieldProposalPayload(
	value: unknown,
): FieldProposalPayload {
	const parsed = fieldProposalPayload.safeParse(value);

	if (!parsed.success) {
		throw new Error(
			`A field proposal is unreadable: ${parsed.error.issues
				.map((issue) => `${issue.path.join(".")} ${issue.message}`)
				.join("; ")}`,
		);
	}

	return parsed.data;
}

export function fieldProposalSubject(entity: string, key: string): string {
	return `${entity}:${key}`;
}
