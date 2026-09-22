import { z } from "zod";

export const mailboxBackfill = z.object({
	v: z.literal(1),
	state: z.enum(["running", "done"]),
	phase: z.enum(["sent", "all"]),
	position: z.string().nullable(),
	before: z.iso.datetime(),
	floor: z.iso.datetime().nullable(),
	reached: z.iso.datetime().nullable(),
});

export type MailboxBackfill = z.infer<typeof mailboxBackfill>;

export type BackfillRead =
	| { outcome: "none" }
	| { outcome: "ok"; backfill: MailboxBackfill }
	| { outcome: "unreadable"; reason: string };

export function readBackfill(raw: string | null | undefined): BackfillRead {
	if (!raw) return { outcome: "none" };

	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch (error) {
		return {
			outcome: "unreadable",
			reason: error instanceof Error ? error.message : String(error),
		};
	}

	const parsed = mailboxBackfill.safeParse(json);
	if (!parsed.success) {
		return { outcome: "unreadable", reason: parsed.error.message };
	}

	return { outcome: "ok", backfill: parsed.data };
}

export function planBackfill(options: {
	before: Date;
	floor: Date | null;
}): MailboxBackfill {
	return {
		v: 1,
		state: "running",
		phase: "sent",
		position: null,
		before: options.before.toISOString(),
		floor: options.floor?.toISOString() ?? null,
		reached: null,
	};
}

export function serialiseBackfill(backfill: MailboxBackfill): string {
	return JSON.stringify(backfill);
}

export function backfillFloor(backfill: MailboxBackfill): Date | null {
	return backfill.floor ? new Date(backfill.floor) : null;
}

export function backfillBefore(backfill: MailboxBackfill): Date {
	return new Date(backfill.before);
}

export function reachedBack(
	backfill: MailboxBackfill,
	sentAt: Date,
): MailboxBackfill {
	const at = sentAt.toISOString();
	if (backfill.reached !== null && backfill.reached <= at) return backfill;

	return { ...backfill, reached: at };
}

export function restartBackfill(backfill: MailboxBackfill): MailboxBackfill {
	return { ...backfill, position: null };
}

export function advancePhase(backfill: MailboxBackfill): MailboxBackfill {
	if (backfill.phase === "sent") {
		return { ...backfill, phase: "all", position: null };
	}

	return finishBackfill(backfill);
}

export function finishBackfill(backfill: MailboxBackfill): MailboxBackfill {
	return { ...backfill, state: "done", position: null };
}

export function stoppedBackfill(now: Date): MailboxBackfill {
	return finishBackfill(planBackfill({ before: now, floor: null }));
}

export function isBackfillRunning(backfill: MailboxBackfill): boolean {
	return backfill.state === "running";
}

export type BackfillProgress = {
	state: MailboxBackfill["state"];
	before: string;
	reached: string | null;
	floor: string | null;
};

export function backfillProgress(
	raw: string | null | undefined,
): BackfillProgress | null {
	const read = readBackfill(raw);
	if (read.outcome !== "ok") return null;

	const { state, before, reached, floor } = read.backfill;
	return { state, before, reached, floor };
}
