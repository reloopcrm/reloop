import { z } from "zod";
import { DRAFT_STYLE } from "./draft-style";

export const agentTaskThreadPayload = z.object({
	threadId: z.string().min(1),
});

export type AgentTaskThreadPayload = z.infer<typeof agentTaskThreadPayload>;

export const AGENT_TASK_THREAD_ID_KEY =
	"threadId" satisfies keyof AgentTaskThreadPayload;

export function readAgentTaskThreadId(value: unknown): string | null {
	const parsed = agentTaskThreadPayload.safeParse(value);
	return parsed.success ? parsed.data.threadId : null;
}

export const agentTaskDraftPayload = z.object({
	instruction: z.string().trim().min(1).max(DRAFT_STYLE.instructionMaxChars),
});

export type AgentTaskDraftPayload = z.infer<typeof agentTaskDraftPayload>;

export function readAgentTaskInstruction(value: unknown): string | null {
	const parsed = agentTaskDraftPayload.safeParse(value);
	return parsed.success ? parsed.data.instruction : null;
}
