import { describe, expect, it } from "bun:test";
import { brief } from "../agent/lib/dispatch";
import type { LeasedTask } from "../agent/lib/tasks";

function task(attempts: number): LeasedTask {
	return {
		id: "cmsdc0a6j004cz96ddzpcgwqr",
		contactId: "cmsdc0a6j004dz96d1a2b3c4d",
		companyId: null,
		dealId: null,
		kind: "identify",
		reason: "new contact",
		payload: null,
		budget: 4,
		attempts,
		priority: 100,
		dueAt: new Date(),
	};
}

describe("brief", () => {
	it("tells a retry that it starts fresh and must check the CRM first", () => {
		const text = brief(task(2));

		expect(text).toContain("This is attempt 2");
		expect(text).toContain("already in the CRM");
		expect(text).not.toContain("this thread");
	});

	it("says nothing about a retry on the first attempt", () => {
		expect(brief(task(1))).not.toContain("attempt");
	});
});
