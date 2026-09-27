import { describe, expect, it } from "bun:test";
import crm, { taskToken } from "../agent/channels/crm";
import { APP_AUTH } from "../agent/lib/app-auth";

type Receive = NonNullable<typeof crm.receive>;
type ReceiveInput = Parameters<Receive>[0];
type ReceiveHelpers = Parameters<Receive>[1];
type SendOptions = { continuationToken: string; mode?: string };

const TASK_ID = "cmsdc0a6j004cz96ddzpcgwqr";

async function sentOptions(target: ReceiveInput["target"]) {
	const calls: SendOptions[] = [];
	const send = async (_message: unknown, options: SendOptions) => {
		calls.push(options);
		return { id: "session_test" };
	};

	await crm.receive?.(
		{ message: "Work out who this contact is.", target, auth: APP_AUTH },
		{ send } as unknown as ReceiveHelpers,
	);

	expect(calls).toHaveLength(1);
	return calls[0];
}

describe("crm channel receive", () => {
	it("starts a research task as a task run that never parks", async () => {
		const options = await sentOptions({ taskId: TASK_ID });

		expect(options?.mode).toBe("task");
		expect(options?.continuationToken).toBe(taskToken(TASK_ID));
	});

	it("leaves an ad hoc message in conversation mode", async () => {
		const options = await sentOptions(undefined);

		expect(options?.mode).toBeUndefined();
		expect(options?.continuationToken.startsWith("crm:adhoc:")).toBe(true);
	});
});
