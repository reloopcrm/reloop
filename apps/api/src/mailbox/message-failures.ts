import {
	AGENT_TASK_ORIGINS,
	type AgentTaskOrigin,
} from "@crm/validation/agent-task-payload";
import { z } from "zod";
import { MESSAGE_FAILURES } from "./mailbox.config";

export const messageFailures = z.array(
	z.object({
		id: z.string().min(1).max(MESSAGE_FAILURES.maxIdLength),
		attempts: z.number().int().min(1).max(MESSAGE_FAILURES.maxAttempts),
		lane: z.enum(AGENT_TASK_ORIGINS),
	}),
);

export type MessageFailures = z.infer<typeof messageFailures>;

export class FailureLedger {
	private entries: MessageFailures;

	constructor(entries: MessageFailures = []) {
		this.entries = [...entries];
	}

	exhausted(id: string): boolean {
		return this.entries.some(
			(entry) =>
				entry.id === id && entry.attempts >= MESSAGE_FAILURES.maxAttempts,
		);
	}

	record(id: string, lane: AgentTaskOrigin): number {
		const attempts = Math.min(
			(this.entries.find((entry) => entry.id === id)?.attempts ?? 0) + 1,
			MESSAGE_FAILURES.maxAttempts,
		);

		this.entries = [
			...this.entries.filter((entry) => entry.id !== id),
			{ id, attempts, lane },
		];

		return attempts;
	}

	clear(id: string): void {
		this.entries = this.entries.filter((entry) => entry.id !== id);
	}

	retain(lane: AgentTaskOrigin, ahead: (id: string) => boolean): void {
		this.entries = this.entries.filter(
			(entry) => entry.lane !== lane || ahead(entry.id),
		);
	}

	list(): MessageFailures | undefined {
		return this.entries.length > 0 ? [...this.entries] : undefined;
	}
}
