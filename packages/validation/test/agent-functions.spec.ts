import { describe, expect, it } from "bun:test";
import {
	AGENT_FUNCTIONS,
	isAgentFunction,
	isAgentFunctionEnabled,
	isTaskKindEnabled,
	parseAgentFunctions,
	WIN_BACK_FOLLOW_UP_FUNCTION,
} from "../src/agent-functions";

describe("the switches for the agent's own functions", () => {
	it("leaves every function on for a row written before the setting existed", () => {
		for (const stored of [null, undefined, {}]) {
			const settings = parseAgentFunctions(stored);

			for (const entry of AGENT_FUNCTIONS) {
				expect(isAgentFunctionEnabled(settings, entry.id)).toBe(true);
			}
		}
	});

	it("leaves every function on when the stored value is unreadable", () => {
		const settings = parseAgentFunctions({ "thread-insight": "off" });

		expect(isAgentFunctionEnabled(settings, "thread-insight")).toBe(true);
	});

	it("reads back the one function the operator switched off", () => {
		const settings = parseAgentFunctions({ "thread-insight": false });

		expect(isAgentFunctionEnabled(settings, "thread-insight")).toBe(false);
		expect(isAgentFunctionEnabled(settings, "email-draft")).toBe(true);
	});

	it("skips the task kinds of a function that is off", () => {
		const settings = parseAgentFunctions({ "contact-research": false });

		for (const kind of ["identify", "profile", "recheck"]) {
			expect(isTaskKindEnabled(settings, kind)).toBe(false);
		}
	});

	it("runs the task kinds of a function that is on", () => {
		const settings = parseAgentFunctions({ "contact-research": true });

		expect(isTaskKindEnabled(settings, "identify")).toBe(true);
		expect(isTaskKindEnabled(settings, "thread-insight")).toBe(true);
	});

	it("runs a task kind no switch covers", () => {
		const settings = parseAgentFunctions({ "thread-insight": false });

		expect(isTaskKindEnabled(settings, "slack-channel-join")).toBe(true);
		expect(isTaskKindEnabled(settings, "agent-event")).toBe(true);
	});

	it("knows which ids exist, so a typed id cannot switch nothing", () => {
		expect(isAgentFunction("thread-insight")).toBe(true);
		expect(isAgentFunction("thread-insights")).toBe(false);
	});

	it("gives every function its own id, group, title and sentence", () => {
		const ids = new Set(AGENT_FUNCTIONS.map((entry) => entry.id));

		expect(ids.size).toBe(AGENT_FUNCTIONS.length);

		for (const entry of AGENT_FUNCTIONS) {
			expect(entry.title.length).toBeGreaterThan(0);
			expect(entry.note.length).toBeGreaterThan(20);
		}

		for (const entry of AGENT_FUNCTIONS) {
			if (entry.id === WIN_BACK_FOLLOW_UP_FUNCTION) continue;
			expect(entry.kinds.length).toBeGreaterThan(0);
		}
	});

	it("carries the win back follow-up switch, which the API runs itself", () => {
		const entry = AGENT_FUNCTIONS.find(
			(row) => row.id === WIN_BACK_FOLLOW_UP_FUNCTION,
		);

		expect(entry?.kinds).toEqual([]);
		expect(isAgentFunction(WIN_BACK_FOLLOW_UP_FUNCTION)).toBe(true);
		expect(
			isAgentFunctionEnabled(
				parseAgentFunctions({ [WIN_BACK_FOLLOW_UP_FUNCTION]: false }),
				WIN_BACK_FOLLOW_UP_FUNCTION,
			),
		).toBe(false);
	});
});
