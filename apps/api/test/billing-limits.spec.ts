import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { addOnsOf, roomFor, usageLines } from "@crm/db/plan-usage";
import {
	DRAFT_KIND,
	INSIGHT_KIND,
	limitsOf,
	monthlyBudget,
	NO_ADD_ONS,
	PLANS,
	RESEARCH_RUN_KIND,
	withAddOns,
} from "@crm/db/plans";
import { addOnLookupKey, parseLookupKey, planLookupKey } from "@crm/db/pricing";
import { NO_BILLING, type Tenant } from "@crm/db/tenancy";
import { TENANCY } from "@crm/db/tenancy-config";
import type Stripe from "stripe";
import {
	applyChange,
	BillingService,
	billingStateOf,
	changeTiming,
	deleteAtOf,
	paymentMethodOf,
	pendingPaymentUrl,
	phaseTax,
	planChanged,
	planChangeExcess,
	type StripeSchedule,
	sameItems,
	scheduledChangeOf,
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
		return new BillingService(db, null, config, {} as never);
	};

	it("rejects a member before any Stripe call", async () => {
		const member = service("member");
		const calls = [
			() => member.overview("member"),
			() => member.checkout("member", { plan: "start", interval: "month" }),
			() => member.setAddOn("member", { addOn: "drafts", quantity: 1 }),
			() => member.previewPlan("member", { plan: "start", interval: "year" }),
			() => member.previewAddOn("member", { addOn: "drafts", quantity: 1 }),
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

describe("the payment method comes from the subscription first", () => {
	const card = (last4: string) =>
		({
			id: `pm_${last4}`,
			object: "payment_method",
			type: "card",
			card: { brand: "visa", last4, exp_month: 4, exp_year: 2030 },
		}) as unknown as Stripe.PaymentMethod;

	it("reads the card Checkout put on the subscription", () => {
		expect(
			paymentMethodOf({ default_payment_method: card("4242") }, {
				invoice_settings: { default_payment_method: null },
			} as never),
		).toEqual({
			kind: "card",
			brand: "visa",
			last4: "4242",
			expires: "04/2030",
		});
	});

	it("falls back to the customer's default when the subscription has none", () => {
		expect(
			paymentMethodOf({ default_payment_method: null }, {
				invoice_settings: { default_payment_method: card("1881") },
			} as never)?.last4,
		).toBe("1881");
	});

	it("is null when neither holds an expanded method", () => {
		expect(
			paymentMethodOf({ default_payment_method: "pm_not_expanded" }, null),
		).toBeNull();
		expect(paymentMethodOf(null, null)).toBeNull();
	});
});

describe("the plan active mail follows a plan or interval change only", () => {
	const previous = (...keys: string[]) => ({
		items: { data: keys.map((key) => ({ price: { lookup_key: key } })) },
	});
	const now = { plan: "standard", interval: "month" } as const;

	it("fires on a new plan or a new interval", () => {
		expect(planChanged(previous(planLookupKey("start", "month")), now)).toBe(
			true,
		);
		expect(planChanged(previous(planLookupKey("standard", "year")), now)).toBe(
			true,
		);
	});

	it("stays quiet for add-ons, renewals and unrelated updates", () => {
		expect(
			planChanged(
				previous(
					planLookupKey("standard", "month"),
					addOnLookupKey("drafts", "month"),
				),
				now,
			),
		).toBe(false);
		expect(planChanged({}, now)).toBe(false);
		expect(planChanged(undefined, now)).toBe(false);
	});
});

describe("a change Stripe has not been paid for yet", () => {
	it("returns the hosted invoice to pay", () => {
		expect(
			pendingPaymentUrl(
				subscription({
					pending_update: { expires_at: 1 },
					latest_invoice: {
						id: "in_open",
						object: "invoice",
						hosted_invoice_url: "https://invoice.stripe.test/in_open",
					},
				} as never),
			),
		).toBe("https://invoice.stripe.test/in_open");
	});

	it("returns nothing once Stripe applied the change", () => {
		expect(
			pendingPaymentUrl(
				subscription({ pending_update: null, latest_invoice: null } as never),
			),
		).toBeNull();
	});
});

describe("plans with AI included cap research and chat per month", () => {
	const usage = {
		insights: 0,
		drafts: 0,
		sessions: 100,
		research: 0,
		chat: 500,
		builder: 0,
	};

	it("stops contact research and chat at the plan's cap", () => {
		const limits = limitsOf("start");
		expect(roomFor("sessions", usage, limits)).toBe(0);
		expect(roomFor("chat", usage, limits)).toBe(0);
		const lines = usageLines(usage, limits);
		expect(lines.find((line) => line.counter === "sessions")).toMatchObject({
			limit: 100,
			reached: true,
		});
		expect(lines.find((line) => line.counter === "chat")).toMatchObject({
			limit: 500,
			reached: true,
		});
	});

	it("holds the approved caps for every included plan", () => {
		expect(
			(["start", "standard", "plus", "team", "office"] as const).map((plan) => [
				PLANS[plan].researchSessionsPerMonth,
				PLANS[plan].chatPerMonth,
			]),
		).toEqual([
			[100, 500],
			[300, 1_500],
			[600, 3_000],
			[1_500, 8_000],
			[4_000, 20_000],
		]);
	});

	it("leaves the own key plans without a cap", () => {
		for (const plan of ["hosting", "hosting-pro"] as const) {
			expect(roomFor("sessions", usage, limitsOf(plan))).toBeNull();
			expect(roomFor("chat", usage, limitsOf(plan))).toBeNull();
		}
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

describe("a step up is billed now, a step down waits for the period end", () => {
	const on = (
		plan: "start" | "standard" | "plus",
		interval: "month" | "year",
	) => ({
		plan,
		interval,
	});

	it("bills a bigger plan and a switch to yearly at once", () => {
		expect(changeTiming(on("standard", "month"), on("plus", "month"))).toBe(
			"now",
		);
		expect(changeTiming(on("standard", "month"), on("standard", "year"))).toBe(
			"now",
		);
		expect(changeTiming(on("standard", "year"), on("plus", "year"))).toBe(
			"now",
		);
	});

	it("schedules a smaller plan and a switch to monthly", () => {
		expect(changeTiming(on("standard", "month"), on("start", "month"))).toBe(
			"period_end",
		);
		expect(changeTiming(on("standard", "year"), on("standard", "month"))).toBe(
			"period_end",
		);
		expect(changeTiming(on("standard", "year"), on("plus", "month"))).toBe(
			"period_end",
		);
		expect(changeTiming(on("standard", "month"), on("start", "year"))).toBe(
			"period_end",
		);
	});

	it("bills at once without a plan to keep", () => {
		expect(
			changeTiming({ plan: null, interval: null }, on("start", "month")),
		).toBe("now");
	});
});

describe("the scheduled change is the phase after the current one", () => {
	const price = (key: string) => ({ id: `price_${key}`, lookup_key: key });
	const schedule = (over: Partial<StripeSchedule> = {}): StripeSchedule => ({
		id: "sub_sched_1",
		status: "active",
		current_phase: { start_date: 100, end_date: 200 },
		phases: [
			{
				start_date: 100,
				end_date: 200,
				items: [
					{ price: price(planLookupKey("standard", "month")), quantity: 1 },
					{ price: price(addOnLookupKey("drafts", "month")), quantity: 2 },
				],
			},
			{
				start_date: 200,
				end_date: 300,
				items: [
					{ price: price(planLookupKey("start", "month")), quantity: 1 },
					{ price: price(addOnLookupKey("drafts", "month")), quantity: 1 },
				],
			},
		],
		...over,
	});

	it("reads plan, interval, add-ons and the switch date", () => {
		expect(scheduledChangeOf(schedule())).toEqual({
			plan: "start",
			interval: "month",
			addOns: { ...NO_ADD_ONS, drafts: 1 },
			at: new Date(200_000),
		});
	});

	it("is nothing without a schedule or once the last phase runs", () => {
		expect(scheduledChangeOf(null)).toBeNull();
		expect(
			scheduledChangeOf(
				schedule({ current_phase: { start_date: 200, end_date: 300 } }),
			),
		).toBeNull();
	});

	it("applies a change to the current items for a schedule preview", () => {
		const items = [
			item(planLookupKey("standard", "month")),
			item(addOnLookupKey("drafts", "month"), 2),
		] as unknown as Stripe.SubscriptionItem[];
		expect(
			applyChange(items, [
				{ id: `si_${planLookupKey("standard", "month")}`, price: "price_plus" },
				{ id: `si_${addOnLookupKey("drafts", "month")}`, quantity: 1 },
				{ price: "price_research", quantity: 1 },
			]),
		).toEqual([
			{ price: "price_plus", quantity: 1 },
			{ price: `price_${addOnLookupKey("drafts", "month")}`, quantity: 1 },
			{ price: "price_research", quantity: 1 },
		]);
	});

	it("carries automatic tax onto a phase only when the subscription has it", () => {
		expect(
			phaseTax({ automatic_tax: { enabled: true } } as Stripe.Subscription),
		).toEqual({ enabled: true });
		expect(
			phaseTax({ automatic_tax: { enabled: false } } as Stripe.Subscription),
		).toBeUndefined();
	});

	it("compares item lists regardless of order", () => {
		expect(
			sameItems(
				[
					{ price: "a", quantity: 1 },
					{ price: "b", quantity: 2 },
				],
				[
					{ price: "b", quantity: 2 },
					{ price: "a", quantity: 1 },
				],
			),
		).toBe(true);
		expect(
			sameItems([{ price: "a", quantity: 1 }], [{ price: "a", quantity: 2 }]),
		).toBe(false);
	});
});
