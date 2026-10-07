import { z } from "zod";
import { MESSAGE_FAILURES } from "./mailbox.config";

export const messageFailures = z
	.array(
		z.object({
			id: z.string().min(1).max(MESSAGE_FAILURES.maxIdLength),
			attempts: z.number().int().min(1).max(MESSAGE_FAILURES.maxAttempts),
		}),
	)
	.max(MESSAGE_FAILURES.maxTracked);

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

	record(id: string): number {
		const attempts = Math.min(
			(this.entries.find((entry) => entry.id === id)?.attempts ?? 0) + 1,
			MESSAGE_FAILURES.maxAttempts,
		);

		this.entries = [
			...this.entries.filter((entry) => entry.id !== id),
			{ id, attempts },
		].slice(-MESSAGE_FAILURES.maxTracked);

		return attempts;
	}

	clear(id: string): void {
		this.entries = this.entries.filter((entry) => entry.id !== id);
	}

	list(): MessageFailures | undefined {
		return this.entries.length > 0 ? [...this.entries] : undefined;
	}
}
