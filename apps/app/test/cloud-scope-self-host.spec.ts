import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	hostedCustomer,
	inScope,
	pendingPurchase,
	requestScope,
} from "../cloud/scope.server";

const saved = { ...process.env };

beforeEach(() => {
	for (const name of Object.keys(process.env)) {
		if (name.startsWith("RELOOP_")) delete process.env[name];
	}
});

afterEach(() => {
	for (const [name, value] of Object.entries(saved)) process.env[name] = value;
});

describe("the app's cloud slot on a self-hosted install", () => {
	it("runs a read exactly once and hands back its answer", async () => {
		let calls = 0;
		expect(await inScope(async () => ++calls)).toBe(1);
		expect(calls).toBe(1);
	});

	it("has no scope, no customer and nothing to pay", async () => {
		expect(await requestScope()).toBeNull();
		expect(await hostedCustomer()).toBe(false);
		expect(await pendingPurchase()).toBeNull();
	});
});
