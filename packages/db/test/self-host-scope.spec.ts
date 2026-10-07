import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cloud } from "../src/cloud/scope";
import { NO_PLAN } from "../src/plans";

const saved = { ...process.env };

beforeEach(() => {
	for (const name of Object.keys(process.env)) {
		if (name.startsWith("RELOOP_")) delete process.env[name];
	}
});

afterEach(() => {
	for (const [name, value] of Object.entries(saved)) process.env[name] = value;
});

describe("the cloud slot on a self-hosted install", () => {
	it("is not hosted, has no customer, no operator and no scope", () => {
		expect(cloud.hosted()).toBe(false);
		expect(cloud.customer()).toBe(false);
		expect(cloud.operatorId()).toBeNull();
		expect(cloud.scopeId()).toBeNull();
		expect(cloud.scopedKey("rates")).toBe("rates");
	});

	it("runs a held piece of work exactly once, in place", () => {
		let calls = 0;
		expect(cloud.hold(() => ++calls)).toBe(1);
		expect(calls).toBe(1);
	});

	it("runs a loop over every workspace exactly once, with a live signal", async () => {
		const signals: AbortSignal[] = [];
		const result = await cloud.forEachScope(async (signal) => {
			signals.push(signal);
			return "done";
		});
		expect(result).toBe("done");
		expect(signals).toHaveLength(1);
		expect(signals[0]?.aborted).toBe(false);
	});

	it("serves the one client of DATABASE_URL", () => {
		const single = {} as never;
		expect(
			cloud.resolveClient(
				() => single,
				() => {
					throw new Error("a self-hosted install creates no tenant client");
				},
			),
		).toBe(single);
	});

	it("finds no workspace scope, and never asks a registry", async () => {
		expect(await cloud.byId("acme")).toBeNull();
		expect(await cloud.activeBySite("site-1")).toBeNull();
		expect(await cloud.active()).toEqual([]);
		await cloud.ping();
		await cloud.disconnectClients();
		await cloud.onMemberAdded("new@example.com");
		await cloud.onMemberRemoved("old@example.com");
	});

	it("throws only when asked for the current scope, which does not exist", () => {
		expect(() => cloud.current()).toThrow();
	});

	it("knows no plan without a plan string, and no add-ons outside a scope", () => {
		for (const plan of [null, undefined, ""]) {
			expect(cloud.plans.limitsOf(plan)).toBe(NO_PLAN);
			expect(cloud.plans.isTrial(plan)).toBe(false);
			expect(cloud.plans.usageWindow(plan, new Date())).toBeNull();
		}
		const limits = { ...NO_PLAN, contacts: 3 };
		expect(cloud.plans.withAddOns(limits)).toEqual(limits);
	});
});
