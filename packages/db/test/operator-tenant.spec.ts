import { afterEach, describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import { addOnsOf, fixedAiFor, planIdOf } from "../src/plan-usage";
import { NO_ADD_ONS } from "../src/plans";
import type { Tenant } from "../src/tenancy";
import {
	isHostedCustomer,
	isOperatorTenant,
	operatorTenantId,
	runAsTenant,
} from "../src/tenant-context";

const saved = {
	registry: process.env.RELOOP_REGISTRY_URL,
	operator: process.env.RELOOP_OPERATOR_TENANT,
};

const tenantOf = (id: string, plan: string): Tenant => ({
	id,
	slug: id,
	dbName: `${id}_test`,
	plan,
	status: "active",
	aiMode: "operator",
	signIn: "google",
	createdAt: new Date("2026-09-21T00:00:00.000Z"),
	trialEndsAt: null,
	suspendedAt: null,
	deletedAt: null,
	allowList: [`${id}.example`],
	paidUntil: null,
	graceUntil: null,
	billing: {
		customerId: null,
		subscriptionId: null,
		status: "none",
		interval: null,
		cancelAt: null,
		addOns: { conversations: 2, drafts: 0, research: 0, mailbox: 0 },
	},
});

const OPERATOR = tenantOf("reloop", "none");
const CUSTOMER = tenantOf("acme", "start");

const noStoredPlan = {
	appSetting: { findUnique: async () => null },
} as unknown as Db;

function hosted(operator: string | undefined) {
	process.env.RELOOP_REGISTRY_URL = "postgresql://registry.test/registry";
	if (operator === undefined) delete process.env.RELOOP_OPERATOR_TENANT;
	else process.env.RELOOP_OPERATOR_TENANT = operator;
}

afterEach(() => {
	for (const [name, value] of [
		["RELOOP_REGISTRY_URL", saved.registry],
		["RELOOP_OPERATOR_TENANT", saved.operator],
	] as const) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

describe("the operator tenant", () => {
	it("is the one tenant named by RELOOP_OPERATOR_TENANT", () => {
		hosted(" reloop ");

		expect(operatorTenantId()).toBe("reloop");
		expect(runAsTenant(OPERATOR, isOperatorTenant)).toBe(true);
		expect(runAsTenant(CUSTOMER, isOperatorTenant)).toBe(false);
		expect(isOperatorTenant()).toBe(false);
		expect(runAsTenant(OPERATOR, isHostedCustomer)).toBe(false);
		expect(runAsTenant(CUSTOMER, isHostedCustomer)).toBe(true);
	});

	it("does not exist without the variable, and never outside hosted mode", () => {
		hosted(undefined);
		expect(operatorTenantId()).toBeNull();
		expect(runAsTenant(OPERATOR, isOperatorTenant)).toBe(false);
		expect(runAsTenant(OPERATOR, isHostedCustomer)).toBe(true);

		delete process.env.RELOOP_REGISTRY_URL;
		process.env.RELOOP_OPERATOR_TENANT = "reloop";
		expect(runAsTenant(OPERATOR, isOperatorTenant)).toBe(false);
		expect(isHostedCustomer()).toBe(false);
	});

	it("has no plan, no fixed AI and no add-ons, while a customer keeps all three", async () => {
		hosted("reloop");

		expect(
			await runAsTenant(OPERATOR, () => planIdOf(noStoredPlan)),
		).toBeNull();
		expect(runAsTenant(OPERATOR, () => fixedAiFor("start"))).toBe(false);
		expect(runAsTenant(OPERATOR, addOnsOf)).toEqual(NO_ADD_ONS);

		expect(await runAsTenant(CUSTOMER, () => planIdOf(noStoredPlan))).toBe(
			"start",
		);
		expect(runAsTenant(CUSTOMER, () => fixedAiFor("start"))).toBe(true);
		expect(runAsTenant(CUSTOMER, addOnsOf).conversations).toBe(2);
	});
});
