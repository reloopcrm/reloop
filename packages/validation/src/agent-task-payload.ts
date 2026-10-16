import { z } from "zod";
import { DRAFT_STYLE } from "./draft-style";

export const AGENT_TASK_ORIGINS = ["forward", "backfill"] as const;

export type AgentTaskOrigin = (typeof AGENT_TASK_ORIGINS)[number];

export const agentTaskThreadPayload = z.object({
	threadId: z.string().min(1),
	origin: z.enum(AGENT_TASK_ORIGINS).default("forward"),
	reread: z.boolean().default(false),
	memoryOnly: z.boolean().default(false),
});

export type AgentTaskThreadPayload = z.input<typeof agentTaskThreadPayload>;

export const AGENT_TASK_THREAD_ID_KEY =
	"threadId" satisfies keyof AgentTaskThreadPayload;

export function readAgentTaskThreadId(value: unknown): string | null {
	const parsed = agentTaskThreadPayload.safeParse(value);
	return parsed.success ? parsed.data.threadId : null;
}

export function readAgentTaskOrigin(value: unknown): AgentTaskOrigin {
	const parsed = agentTaskThreadPayload.safeParse(value);
	return parsed.success ? parsed.data.origin : "forward";
}

export function readAgentTaskReread(value: unknown): boolean {
	const parsed = agentTaskThreadPayload.safeParse(value);
	return parsed.success ? parsed.data.reread : false;
}

export function readAgentTaskMemoryOnly(value: unknown): boolean {
	const parsed = agentTaskThreadPayload.safeParse(value);
	return parsed.success ? parsed.data.memoryOnly : false;
}

export const agentTaskDraftPayload = z.object({
	instruction: z.string().trim().min(1).max(DRAFT_STYLE.instructionMaxChars),
	oneOff: z.boolean().default(false),
});

export type AgentTaskDraftPayload = z.input<typeof agentTaskDraftPayload>;

export function readAgentTaskInstruction(value: unknown): string | null {
	const parsed = agentTaskDraftPayload.safeParse(value);
	return parsed.success ? parsed.data.instruction : null;
}

export function readAgentTaskOneOff(value: unknown): boolean {
	const parsed = agentTaskDraftPayload.safeParse(value);
	return parsed.success ? parsed.data.oneOff : false;
}

export const agentTaskStoryPayload = z.object({
	reread: z.boolean().default(false),
});

export type AgentTaskStoryPayload = z.input<typeof agentTaskStoryPayload>;

export function readAgentTaskStoryReread(value: unknown): boolean {
	const parsed = agentTaskStoryPayload.safeParse(value);
	return parsed.success ? parsed.data.reread : false;
}

export const agentTaskMeetingPayload = z.object({
	eventId: z.string().min(1),
});

export type AgentTaskMeetingPayload = z.infer<typeof agentTaskMeetingPayload>;

export const MEETING_EVENT_KEY =
	"eventId" satisfies keyof AgentTaskMeetingPayload;

export function readAgentTaskMeetingEventId(value: unknown): string | null {
	const parsed = agentTaskMeetingPayload.safeParse(value);
	return parsed.success ? parsed.data.eventId : null;
}
