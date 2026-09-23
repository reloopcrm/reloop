import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { addOnsOf } from "@crm/db/plan-usage";
import {
	DRAFT_KIND,
	INSIGHT_KIND,
	limitsOf,
	monthlyBudget,
	NO_ADD_ONS,
	RESEARCH_RUN_KIND,
	withAddOns,
} from "@crm/db/plans";
import { addOnLookupKey, parseLookupKey, planLookupKey } from "@crm/db/pricing";
import { NO_BILLING, type Tenant } from "@crm/db/tenancy";
import { TENANCY } from "@crm/db/tenancy-config";
import type Stripe from "stripe";
import {
	BillingService,
	billingStateOf,
	checkoutTrialEnd,
	deleteAtOf,
	planChangeExcess,
	subscriptionState,
} from "../src/billing/billing.service";
import { openWhileSuspended } from "../src/tenancy/tenant.middleware";

const tenant = (over: Partial<Tenant> = {}): Tenant => ({
	id: "acme",
	slug: "acme",
	dbName: "crm_acme",
	plan: "trial",
	status: "active",
	aiMode: "operator",
	signIn: "google",
	createdAt: new Date(0),
	trialEndsAt: null,
	suspendedAt: null,
	deletedAt: null,
	allowList: [],
	paidUntil: null,
	graceUntil: null,
	billing: NO_BILLING,
	...over,
});

function item(lookupKey: string, quantity = 1) {
	return {
		id: `si_${lookupKey}`,
		quantity,
		current_period_end: 1_800_000_000,
		price: { id: `price_${lookupKey}`, lookup_key: lookupKey },
	};
}

function subscription(
	over: Omit<Partial<Stripe.Subscription>, "items"> & {
		items?: { data: ReturnType<typeof item>[] };
	},
): Stripe.Subscription {
	return {
		id: "sub_1",
		customer: "cus_1",
		status: "active",
		cancel_at: null,
		metadata: { tenantId: "acme" },
		items: { data: [item(planLookupKey("standard", "month"))] },
		...over,
	} as unknown as Stripe.Subscription;
}

describe("add-ons raise the monthly budgets", () => {
	it("adds the bought amount to the plan's limit", () => {
		const raised = withAddOns(limitsOf("standard"), {
			conversations: 2,
			drafts: 1,
			research: 3,
			mailbox: 1,
		});
		expect(monthlyBudget(INSIGHT_KIND, raised)).toBe(3_000 + 2_000);
		expect(monthlyBudget(DRAFT_KIND, raised)).toBe(100 + 100);
		expect(monthlyBudget(RESEARCH_RUN_KIND, raised)).toBe(150 + 150);
		expect(raised.mailboxes).toBe(2);
		expect(raised.contacts).toBe(25_000);
	});

	it("leaves an unlimited counter unlimited", () => {
		const raised = withAddOns(limitsOf("hosting"), { drafts: 5 });
		expect(raised.draftsPerMonth).toBeNull();
	});

	it("changes nothing without add-ons", () => {
		expect(withAddOns(limitsOf("start"), NO_ADD_ONS)).toEqual(
			limitsOf("start"),
		);
	});

	it("knows no add-ons on a single-tenant install", () => {
		const saved = process.env.RELOOP_REGISTRY_URL;
		delete process.env.RELOOP_REGISTRY_URL;
		try {
			expect(addOnsOf()).toEqual(NO_ADD_ONS);
		} finally {
			if (saved !== undefined) process.env.RELOOP_REGISTRY_URL = saved;
		}
	});
});

describe("lookup keys", () => {
	it("round trip for plans and add-ons", () => {
		expect(parseLookupKey(planLookupKey("team", "year"))).toEqual({
			kind: "plan",
			plan: "team",
			interval: "year",
		});
		expect(parseLookupKey(addOnLookupKey("drafts", "month"))).toEqual({
			kind: "addon",
			addOn: "drafts",
			interval: "month",
		});
		expect(parseLookupKey("reloop:plan:trial:month")).toBeNull();
		expect(parseLookupKey("other:plan:start:month")).toBeNull();
		expect(parseLookupKey(null)).toBeNull();
	});
});

describe("a Stripe subscription becomes a billing state", () => {
	it("reads the plan, the interval, the period end and the add-ons", () => {
		const state = subscriptionState(
			subscription({
				items: {
					data: [
						item(planLookupKey("plus", "year")),
						item(addOnLookupKey("conversations", "year"), 2),
						item(addOnLookupKey("mailbox", "year")),
					],
				},
			}),
		);
		expect(state.plan).toBe("plus");
		expect(state.interval).toBe("year");
		expect(state.paidUntil?.toISOString()).toBe(
			new Date(1_800_000_000 * 1000).toISOString(),
		);
		expect(state.addOns).toEqual({
			conversations: 2,
			drafts: 0,
			research: 0,
			mailbox: 1,
		});
		expect(state.status).toBe("active");
		expect(state.customerId).toBe("cus_1");
	});

	it("maps Stripe's statuses onto ours", () => {
		const of = (status: Stripe.Subscription.Status) =>
			subscriptionState(subscription({ status })).status;
		expect(of("trialing")).toBe("active");
		expect(of("past_due")).toBe("past_due");
		expect(of("unpaid")).toBe("past_due");
		expect(of("canceled")).toBe("canceled");
		expect(of("incomplete")).toBe("none");
	});

	it("keeps the cancel date", () => {
		const state = subscriptionState(subscription({ cancel_at: 1_800_000_000 }));
		expect(state.cancelAt?.getTime()).toBe(1_800_000_000 * 1000);
	});
});

describe("the page state of a tenant", () => {
	it("is trial, active, canceling, past due or none", () => {
		expect(billingStateOf(tenant())).toBe("trial");
		expect(billingStateOf(tenant({ plan: "standard" }))).toBe("none");
		expect(
			billingStateOf(
				tenant({
					plan: "standard",
					billing: { ...NO_BILLING, status: "active" },
				}),
			),
		).toBe("active");
		expect(
			billingStateOf(
				tenant({
					plan: "standard",
					billing: { ...NO_BILLING, status: "active", cancelAt: new Date() },
				}),
			),
		).toBe("canceling");
		expect(
			billingStateOf(
				tenant({
					plan: "standard",
					billing: { ...NO_BILLING, status: "past_due" },
				}),
			),
		).toBe("past_due");
	});
});

describe("billing authorization", () => {
	const service = (role: string | null) => {
		const db = {
			member: { findUnique: async () => (role ? { role } : null) },
		} as unknown as Db;
		const config = { get: () => undefined } as never;
		return new BillingService(db, null, config);
	};

	it("rejects a member before any Stripe call", async () => {
		const member = service("member");
		const calls = [
			() => member.overview("member"),
			() => member.checkout("member", { plan: "start", interval: "month" }),
			() => member.setAddOn("member", { addOn: "drafts", quantity: 1 }),
			() => member.cancel("member"),
			() => member.resume("member"),
			() => member.portal("member", { flow: "billing" }),
		];
		for (const call of calls)
			await expect(call()).rejects.toThrow("Only a workspace admin");
	});

	it("refuses a mutation on a single-tenant install", async () => {
		const saved = process.env.RELOOP_REGISTRY_URL;
		delete process.env.RELOOP_REGISTRY_URL;
		try {
			await expect(
				service("owner").checkout("owner", {
					plan: "start",
					interval: "month",
				}),
			).rejects.toThrow("only offered on the hosted Cloud");
		} finally {
			if (saved !== undefined) process.env.RELOOP_REGISTRY_URL = saved;
		}
	});

	it("is not configured without a key", () => {
		expect(service("owner").configured).toBe(false);
	});
});

describe("a subscription during the trial keeps the trial", () => {
	const now = new Date("2026-10-01T12:00:00.000Z");
	const trial = (endsAt: Date, over: Partial<Tenant> = {}) =>
		tenant({ trialEndsAt: endsAt, ...over });

	it("passes the trial end to Checkout when it is more than 48 hours away", () => {
		const endsAt = new Date("2026-10-10T12:00:00.000Z");
		expect(checkoutTrialEnd(trial(endsAt), now)?.toISOString()).toBe(
			endsAt.toISOString(),
		);
	});

	it("charges now when the trial ends within 48 hours", () => {
		expect(
			checkoutTrialEnd(trial(new Date("2026-10-03T11:00:00.000Z")), now),
		).toBeNull();
		expect(
			checkoutTrialEnd(trial(new Date("2026-09-30T12:00:00.000Z")), now),
		).toBeNull();
	});

	it("charges now for a suspended workspace or a paid plan", () => {
		const endsAt = new Date("2026-10-10T12:00:00.000Z");
		expect(
			checkoutTrialEnd(trial(endsAt, { status: "suspended" }), now),
		).toBeNull();
		expect(checkoutTrialEnd(trial(endsAt, { plan: "start" }), now)).toBeNull();
		expect(checkoutTrialEnd(tenant(), now)).toBeNull();
	});
});

describe("a paused workspace", () => {
	it("is deleted a fixed time after the suspension", () => {
		const suspendedAt = new Date("2026-10-01T00:00:00.000Z");
		expect(deleteAtOf({ status: "suspended", suspendedAt })?.getTime()).toBe(
			suspendedAt.getTime() + TENANCY.trial.suspendedTtlMs,
		);
		expect(deleteAtOf({ status: "active", suspendedAt })).toBeNull();
	});

	it("reaches sign-in and billing, nothing else", () => {
		expect(openWhileSuspended("/api/auth/sign-in/email")).toBe(true);
		expect(openWhileSuspended("/api/trpc/billing.overview")).toBe(true);
		expect(
			openWhileSuspended("/api/trpc/billing.overview,billing.portal"),
		).toBe(true);
		expect(openWhileSuspended("/api/trpc/billing.overview,contacts.list")).toBe(
			false,
		);
		expect(openWhileSuspended("/api/trpc/users.me")).toBe(false);
		expect(openWhileSuspended("/api/rest/billing")).toBe(false);
		expect(openWhileSuspended("/api/trpc/billingx.read")).toBe(false);
	});
});

describe("a plan change never lands above a contact or mailbox limit", () => {
	const usage = { contacts: 12_400, mailboxes: 3 };

	it("refuses Hosting for a workspace above its contacts and mailboxes", () => {
		expect(planChangeExcess("hosting", "trial", NO_ADD_ONS, usage)).toEqual([
			{ counter: "contacts", used: 12_400, limit: 10_000 },
			{ counter: "mailboxes", used: 3, limit: 2 },
		]);
	});

	it("refuses any smaller plan, not only Hosting", () => {
		expect(planChangeExcess("start", "team", NO_ADD_ONS, usage)).toEqual([
			{ counter: "contacts", used: 12_400, limit: 10_000 },
			{ counter: "mailboxes", used: 3, limit: 1 },
		]);
	});

	it("allows a plan that holds the workspace, and a workspace exactly at the limit", () => {
		expect(planChangeExcess("team", "trial", NO_ADD_ONS, usage)).toEqual([]);
		expect(
			planChangeExcess("hosting", "trial", NO_ADD_ONS, {
				contacts: 10_000,
				mailboxes: 2,
			}),
		).toEqual([]);
	});

	it("counts the mailbox add-on the subscription keeps", () => {
		expect(
			planChangeExcess(
				"hosting",
				"plus",
				{ ...NO_ADD_ONS, mailbox: 1 },
				{ contacts: 0, mailboxes: 3 },
			),
		).toEqual([]);
	});

	it("always keeps the current plan, so the interval can still change", () => {
		expect(planChangeExcess("start", "start", NO_ADD_ONS, usage)).toEqual([]);
		expect(planChangeExcess("standard", "handel", NO_ADD_ONS, usage)).toEqual(
			[],
		);
	});
});
