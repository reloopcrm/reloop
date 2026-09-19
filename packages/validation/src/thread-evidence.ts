import { z } from "zod";

export type ThreadEvidenceLine = {
	quote: string;
	messageId: string | null;
};

const storedThreadEvidence = z.object({
	evidence: z.array(z.string()),
	evidenceMessageIds: z.array(z.string()),
});

export function parseThreadEvidence(value: unknown): ThreadEvidenceLine[] {
	const stored = storedThreadEvidence.parse(value);

	return stored.evidence.map((quote, index) => {
		const messageId = stored.evidenceMessageIds[index]?.trim() ?? "";
		return { quote, messageId: messageId.length > 0 ? messageId : null };
	});
}
