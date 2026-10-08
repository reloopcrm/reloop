import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";
import activity from "../agent/hooks/activity";

type Handler = (event: { data: object }, ctx: Record<string, never>) => void;

const UNIQUE_FAILURE =
	"Invalid `prisma.contact.update()` invocation: Unique constraint failed on the fields: (`email`). Key (email)=(preview@example.com) already exists. Code: P2002";

const printed: string[] = [];
const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
	printed.push(args.map(String).join(" "));
});

afterEach(() => {
	printed.length = 0;
});

afterAll(() => {
	spy.mockRestore();
});

describe("the activity log", () => {
	it("prints the code of a failed tool call, never the address in its message", () => {
		const handler = activity.events["action.result"] as unknown as Handler;

		handler(
			{
				data: {
					status: "failed",
					error: { code: "TOOL_EXECUTION_FAILED", message: UNIQUE_FAILURE },
					result: {
						kind: "tool-result",
						callId: "call-1",
						toolName: "record_fact",
					},
				},
			},
			{},
		);

		expect(printed).toHaveLength(1);
		expect(printed[0]).toContain("record_fact");
		expect(printed[0]).toContain("TOOL_EXECUTION_FAILED");
		expect(printed[0]).toContain("P2002");
		expect(printed[0]).not.toContain("@");
	});

	it("prints only the code of a failed step, turn and session", () => {
		const message = `A reply to preview@example.com failed. ${UNIQUE_FAILURE}`;

		for (const name of ["step.failed", "turn.failed", "session.failed"]) {
			const handler = activity.events[
				name as keyof typeof activity.events
			] as unknown as Handler;
			handler({ data: { stepIndex: 0, code: "MODEL_ERROR", message } }, {});
		}

		expect(printed).toHaveLength(3);
		for (const line of printed) {
			expect(line).toContain("MODEL_ERROR");
			expect(line).not.toContain("@");
		}
	});
});
