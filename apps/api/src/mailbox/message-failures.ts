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
		lanes: z.array(z.enum(AGENT_TASK_ORIGINS)).min(1),
	}),
);

export type MessageFailures = z.infer<typeof messageFailures>;

export class FailureLedger {
	private entries: MessageFailures;

	constructor(entries: MessageFailures = []) {
		this.entries = entries.map((entry) => ({
			...entry,
			lanes: [...entry.lanes],
		}));
	}

	skip(id: string, lane: AgentTaskOrigin): boolean {
		const entry = this.entries.find((candidate) => candidate.id === id);
		if (!entry || entry.attempts < MESSAGE_FAILURES.maxAttempts) return false;

		this.join(entry, lane);
		return true;
	}

	record(id: string, lane: AgentTaskOrigin): number {
		const entry = this.entries.find((candidate) => candidate.id === id);
		if (entry) {
			entry.attempts = Math.min(
				entry.attempts + 1,
				MESSAGE_FAILURES.maxAttempts,
			);
			this.join(entry, lane);
			return entry.attempts;
		}

		this.entries = [...this.entries, { id, attempts: 1, lanes: [lane] }];
		return 1;
	}

	clear(id: string): void {
		this.entries = this.entries.filter((entry) => entry.id !== id);
	}

	retain(lane: AgentTaskOrigin, ahead: (id: string) => boolean): void {
		this.entries = this.entries.flatMap((entry) => {
			if (!entry.lanes.includes(lane) || ahead(entry.id)) return [entry];
			const lanes = entry.lanes.filter((other) => other !== lane);
			return lanes.length > 0 ? [{ ...entry, lanes }] : [];
		});
	}

	list(): MessageFailures | undefined {
		return this.entries.length > 0
			? this.entries.map((entry) => ({ ...entry, lanes: [...entry.lanes] }))
			: undefined;
	}

	private join(entry: MessageFailures[number], lane: AgentTaskOrigin): void {
		if (!entry.lanes.includes(lane)) entry.lanes = [...entry.lanes, lane];
	}
}
