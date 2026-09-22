import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import {
	ensureWorkspaceMembership,
	setPasswordFor,
	TENANT_COOKIE_NAME,
	tenantCookieValue,
} from "@crm/auth";
import { db } from "@crm/db";
import { planLimitsOf } from "@crm/db/plan-usage";
import { addOnLookupKey, planLookupKey } from "@crm/db/pricing";
import { readPlan, writePlan } from "@crm/db/settings";
import {
	closeRegistry,
	NO_BILLING,
	setTenantStatus,
	type Tenant,
	tenantById,
	writeTenantBilling,
} from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { prepareTestTenants, registryQuery } from "@crm/db/test-tenants";
import type Stripe from "stripe";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { BILLING } from "../src/billing/billing.config";
import { BillingService } from "../src/billing/billing.service";
import { STRIPE } from "../src/billing/stripe.provider";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const PREPARE_TIMEOUT_MS = 120_000;
const SECRET = "whsec_test_only_never_real";
const PERIOD_END = 1_800_000_000;
const PASSWORD = "ein-sehr-langes-passwort-fuer-billing";
const OWNER = {
	id: "billing-owner-a",
	email: "billing-owner@tenant-a.example",
};

function item(lookupKey: string, quantity = 1) {
	return {
		id: `si_${lookupKey}`,
		quantity,
		current_period_end: PERIOD_END,
		price: { id: `price_${lookupKey}`, lookup_key: lookupKey },
	};
}

function subscriptionFixture(
	tenantId: string,
	over: Omit<Partial<Stripe.Subscription>, "items"> & {
		items?: { data: ReturnType<typeof item>[] };
	} = {},
): Stripe.Subscription {
	return {
		id: "sub_spec",
		object: "subscription",
		customer: "cus_spec",
		status: "active",
		cancel_at: null,
		cancel_at_period_end: false,
		metadata: { tenantId },
		items: {
			data: [
				item(planLookupKey("standard", "month")),
				item(addOnLookupKey("drafts", "month"), 2),
			],
		},
		...over,
	} as unknown as Stripe.Subscription;
}

describe("the Stripe webhook is the source of truth for the plan", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
		key: process.env.STRIPE_SECRET_KEY,
		secret: process.env.STRIPE_WEBHOOK_SECRET,
	};
	const spies: { mockRestore: () => void }[] = [];
	let app: Awaited<ReturnType<typeof import("../src/create-app").createApp>>;
	let server: ReturnType<typeof app.getHttpServer>;
	let stripe: Stripe;
	let a: Tenant;
	let current: Stripe.Subscription;
	let sessionCookie = "";
	let billing: BillingService;

	const tenantCookie = () =>
		`${TENANT_COOKIE_NAME}=${tenantCookieValue(a.id, process.env.BETTER_AUTH_SECRET ?? "")}`;

	const cleanOwner = () =>
		runAsTenant(a, async () => {
			await db.session.deleteMany({ where: { userId: OWNER.id } });
			await db.account.deleteMany({ where: { userId: OWNER.id } });
			await db.member.deleteMany({ where: { userId: OWNER.id } });
			await db.user.deleteMany({ where: { id: OWNER.id } });
		});

	const post = async (
		type: string,
		object: Stripe.Subscription | Stripe.Invoice | Stripe.Checkout.Session,
		secret = SECRET,
	) => {
		const payload = JSON.stringify({
			id: `evt_${type}`,
			object: "event",
			type,
			data: { object },
		});
		const header = await stripe.webhooks.generateTestHeaderStringAsync({
			payload,
			secret,
		});
		return request(server)
			.post(BILLING.webhook.path)
			.set("stripe-signature", header)
			.set("content-type", "application/json")
			.send(payload)
			.then((response) => response);
	};

	const reset = async () => {
		await writeTenantBilling(a.id, {
			plan: "trial",
			paidUntil: null,
			graceUntil: null,
			billing: NO_BILLING,
		});
		await setTenantStatus(a.id, "active");
		await runAsTenant(a, () => writePlan(db, "trial"));
	};

	beforeAll(async () => {
		process.env.STRIPE_SECRET_KEY = "sk_test_placeholder_never_real";
		process.env.STRIPE_WEBHOOK_SECRET = SECRET;
		({ a } = await prepareTestTenants());
		await reset();
		await cleanOwner();
		await runAsTenant(a, async () => {
			await db.user.create({
				data: {
					id: OWNER.id,
					email: OWNER.email,
					name: "Billing owner",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await ensureWorkspaceMembership(OWNER.id);
			await db.member.updateMany({
				where: { userId: OWNER.id },
				data: { role: "owner" },
			});
			await setPasswordFor(OWNER.id, PASSWORD);
		});

		spies.push(
			spyOn(
				DispatchHeartbeatService.prototype,
				"onApplicationBootstrap",
			).mockImplementation(() => {}),
			spyOn(
				MailboxSyncHeartbeatService.prototype,
				"onApplicationBootstrap",
			).mockImplementation(() => {}),
			spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
				() => {},
			),
		);

		const { createApp } = await import("../src/create-app");
		app = await createApp();
		server = app.getHttpServer();
		stripe = app.get<Stripe>(STRIPE);
		billing = app.get(BillingService);
		current = subscriptionFixture(a.id);
		spies.push(
			spyOn(stripe.subscriptions, "retrieve").mockImplementation(
				(async () => current) as never,
			),
		);
	}, PREPARE_TIMEOUT_MS);

	afterAll(async () => {
		try {
			await reset();
			await cleanOwner();
			await app?.close();
			await closeRegistry();
		} finally {
			for (const spy of spies) spy.mockRestore();
			for (const [name, value] of [
				["RELOOP_REGISTRY_URL", saved.registry],
				["RELOOP_TENANT_DATABASE_URL_TEMPLATE", saved.template],
				["STRIPE_SECRET_KEY", saved.key],
				["STRIPE_WEBHOOK_SECRET", saved.secret],
			] as const) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	});

	it("rejects a wrong signature and touches nothing", async () => {
		const response = await post(
			"customer.subscription.created",
			current,
			"whsec_wrong",
		);
		expect(response.status).toBe(400);
		expect((await tenantById(a.id))?.plan).toBe("trial");
	});

	it("rejects a missing signature", async () => {
		await request(server)
			.post(BILLING.webhook.path)
			.set("content-type", "application/json")
			.send("{}")
			.expect(400);
	});

	it("writes plan, paid-until and add-ons on a new subscription, twice the same", async () => {
		for (const round of [1, 2]) {
			const response = await post("checkout.session.completed", {
				id: "cs_spec",
				object: "checkout.session",
				subscription: current.id,
			} as unknown as Stripe.Checkout.Session);
			expect(response.status).toBe(200);

			const tenant = await tenantById(a.id);
			expect(tenant?.plan).toBe("standard");
			expect(tenant?.status).toBe("active");
			expect(tenant?.paidUntil?.getTime()).toBe(PERIOD_END * 1000);
			expect(tenant?.billing.status).toBe("active");
			expect(tenant?.billing.customerId).toBe("cus_spec");
			expect(tenant?.billing.subscriptionId).toBe("sub_spec");
			expect(tenant?.billing.interval).toBe("month");
			expect(tenant?.billing.addOns.drafts).toBe(2);
			expect(await runAsTenant(a, () => readPlan(db))).toBe("standard");
			expect(round).toBeGreaterThan(0);
		}
	});

	it("raises the monthly budget by the bought add-ons", async () => {
		const tenant = await tenantById(a.id);
		if (!tenant) throw new Error("tenant a missing");
		const limits = await runAsTenant(tenant, () => planLimitsOf(db));
		expect(limits.draftsPerMonth).toBe(100 + 2 * 100);
		expect(limits.insightsPerMonth).toBe(3_000);
	});

	it("starts a grace period on a failed payment and clears it when paid", async () => {
		current = subscriptionFixture(a.id, { status: "past_due" });
		const invoice = {
			id: "in_spec",
			object: "invoice",
			parent: { subscription_details: { subscription: current.id } },
		} as unknown as Stripe.Invoice;
		expect((await post("invoice.payment_failed", invoice)).status).toBe(200);
		let tenant = await tenantById(a.id);
		expect(tenant?.billing.status).toBe("past_due");
		expect(tenant?.graceUntil).not.toBeNull();
		expect(tenant?.status).toBe("active");
		const grace = tenant?.graceUntil?.getTime();

		expect((await post("invoice.payment_failed", invoice)).status).toBe(200);
		expect((await tenantById(a.id))?.graceUntil?.getTime()).toBe(grace);

		current = subscriptionFixture(a.id);
		expect((await post("invoice.paid", invoice)).status).toBe(200);
		tenant = await tenantById(a.id);
		expect(tenant?.billing.status).toBe("active");
		expect(tenant?.graceUntil).toBeNull();
	});

	it("marks the plan as ending when the customer cancels", async () => {
		current = subscriptionFixture(a.id, {
			cancel_at: PERIOD_END,
			cancel_at_period_end: true,
		});
		expect((await post("customer.subscription.updated", current)).status).toBe(
			200,
		);
		const tenant = await tenantById(a.id);
		expect(tenant?.billing.cancelAt?.getTime()).toBe(PERIOD_END * 1000);
		expect(tenant?.plan).toBe("standard");
	});

	it("suspends the workspace when the subscription ends, twice the same", async () => {
		current = subscriptionFixture(a.id, { status: "canceled" });
		for (const round of [1, 2]) {
			expect(
				(await post("customer.subscription.deleted", current)).status,
			).toBe(200);
			const tenant = await tenantById(a.id);
			expect(tenant?.status).toBe("suspended");
			expect(tenant?.billing.status).toBe("canceled");
			expect(tenant?.billing.addOns.drafts).toBe(0);
			expect(tenant?.paidUntil).toBeNull();
			expect(round).toBeGreaterThan(0);
		}
	});

	it("lets a suspended workspace sign in and reach billing, nothing else", async () => {
		const signIn = await request(server)
			.post("/api/auth/sign-in/email")
			.set("cookie", tenantCookie())
			.send({ email: OWNER.email, password: PASSWORD });
		expect(signIn.status).toBe(200);
		sessionCookie = String(signIn.headers["set-cookie"])
			.split(",")
			.map((part) => part.split(";")[0]?.trim() ?? "")
			.filter((part) => part.includes("session_token"))
			.join("; ");
		expect(sessionCookie).toContain("session_token");

		const cookies = `${tenantCookie()}; ${sessionCookie}`;
		const overview = await request(server)
			.get("/api/trpc/billing.overview")
			.set("cookie", cookies);
		expect(overview.status).toBe(200);
		expect(overview.body.result.data.suspended).toBe(true);
		expect(overview.body.result.data.deleteAt).not.toBeNull();

		const me = await request(server)
			.get("/api/trpc/users.me")
			.set("cookie", cookies);
		expect(me.status).toBe(403);
		expect(me.body.message).toBe("TENANT_SUSPENDED");

		const mixed = await request(server)
			.get("/api/trpc/billing.overview,users.me?batch=1&input={}")
			.set("cookie", cookies);
		expect(mixed.status).toBe(403);
	});

	it("reactivates a suspended workspace when a subscription is active again", async () => {
		current = subscriptionFixture(a.id);
		expect((await post("customer.subscription.updated", current)).status).toBe(
			200,
		);
		const tenant = await tenantById(a.id);
		expect(tenant?.status).toBe("active");
		expect(tenant?.plan).toBe("standard");
	});

	it("keeps a trial that ends in more than 48 hours, charges now otherwise", async () => {
		await reset();
		const createdSessions: Stripe.Checkout.SessionCreateParams[] = [];
		const created = spyOn(
			stripe.checkout.sessions,
			"create",
		).mockImplementation((async (
			params: Stripe.Checkout.SessionCreateParams,
		) => {
			createdSessions.push(params);
			return { url: "https://checkout.stripe.test/cs_spec" };
		}) as never);
		const listed = spyOn(stripe.prices, "list").mockImplementation(
			(async () => ({ data: [{ id: "price_spec" }] })) as never,
		);
		try {
			const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60_000);
			await registryQuery(
				"UPDATE tenant SET trial_ends_at = $2 WHERE id = $1",
				[a.id, inTenDays.toISOString()],
			);
			const tenant = await tenantById(a.id);
			if (!tenant) throw new Error("tenant a missing");
			const kept = await runAsTenant(tenant, () =>
				billing.checkout(OWNER.id, { plan: "start", interval: "month" }),
			);
			expect(kept.url).toBe("https://checkout.stripe.test/cs_spec");
			expect(createdSessions[0]?.subscription_data?.trial_end).toBe(
				Math.floor(inTenDays.getTime() / 1000),
			);
			expect(createdSessions[0]?.subscription_data?.metadata?.tenantId).toBe(
				a.id,
			);

			const overview = await runAsTenant(tenant, () =>
				billing.overview(OWNER.id),
			);
			expect(overview.trialKeptUntil).toBe(inTenDays.toISOString());

			const inOneDay = new Date(Date.now() + 24 * 60 * 60_000);
			await registryQuery(
				"UPDATE tenant SET trial_ends_at = $2 WHERE id = $1",
				[a.id, inOneDay.toISOString()],
			);
			const soon = await tenantById(a.id);
			if (!soon) throw new Error("tenant a missing");
			await runAsTenant(soon, () =>
				billing.checkout(OWNER.id, { plan: "start", interval: "year" }),
			);
			expect(createdSessions[1]?.subscription_data?.trial_end).toBeUndefined();
			expect(createdSessions[1]?.payment_method_types).toEqual(["card"]);
		} finally {
			created.mockRestore();
			listed.mockRestore();
			await registryQuery(
				"UPDATE tenant SET trial_ends_at = NULL WHERE id = $1",
				[a.id],
			);
		}
	});

	it("ignores an event for an unknown subscription", async () => {
		current = subscriptionFixture("nobody-here", {
			customer: "cus_unknown",
			metadata: {},
		});
		expect((await post("customer.subscription.updated", current)).status).toBe(
			200,
		);
	});
});
