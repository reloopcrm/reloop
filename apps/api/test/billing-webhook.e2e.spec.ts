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
	forgetTenant,
	NO_BILLING,
	setTenantStatus,
	type Tenant,
	tenantById,
	writeTenantBilling,
} from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { prepareTestTenants, registryQuery } from "@crm/db/test-tenants";
import { Logger } from "@nestjs/common";
import type Stripe from "stripe";
import request from "supertest";
import { z } from "zod";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { BILLING } from "../src/billing/billing.config";
import { BillingService } from "../src/billing/billing.service";
import { STRIPE } from "../src/billing/stripe.provider";
import { workspaceLocale } from "../src/mail/billing-mail.service";
import { type Mail, MailService } from "../src/mail/mail.service";
import { countMailboxes } from "../src/mailbox/sync-state.service";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";
import { TenantSweepService } from "../src/tenancy/tenant-sweep.service";

const PREPARE_TIMEOUT_MS = 120_000;
const SECRET = "whsec_test_only_never_real";
const PERIOD_START = 1_797_400_000;
const PERIOD_END = 1_800_000_000;
const PERIOD_END_ISO = new Date(PERIOD_END * 1000).toISOString();
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
		automatic_tax: { enabled: true },
		cancel_at: null,
		cancel_at_period_end: false,
		default_payment_method: null,
		pending_update: null,
		latest_invoice: null,
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

function invoiceFixture(id: string, subscription: string): Stripe.Invoice {
	return {
		id,
		object: "invoice",
		amount_due: 7_900,
		total: 7_900,
		currency: "eur",
		attempt_count: 1,
		hosted_invoice_url: `https://invoice.stripe.test/${id}`,
		invoice_pdf: `https://invoice.stripe.test/${id}.pdf`,
		parent: { subscription_details: { subscription } },
	} as unknown as Stripe.Invoice;
}

function cardOnSubscription(): Stripe.PaymentMethod {
	return {
		id: "pm_card_spec",
		object: "payment_method",
		type: "card",
		card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2030 },
	} as unknown as Stripe.PaymentMethod;
}

const RUN = crypto.randomUUID().slice(0, 8);
const createdCustomers: Stripe.CustomerCreateParams[] = [];
const updatedCustomers: {
	id: string;
	params: Stripe.CustomerUpdateParams;
}[] = [];
const previews: Stripe.InvoiceCreatePreviewParams[] = [];
const priceLookups: string[] = [];
const scheduleCalls = {
	created: [] as Stripe.SubscriptionScheduleCreateParams[],
	updated: [] as {
		id: string;
		params: Stripe.SubscriptionScheduleUpdateParams;
	}[],
	released: [] as string[],
};
let schedule: Stripe.SubscriptionSchedule | null = null;

function expandedPrice(id: string) {
	return { id, lookup_key: id.replace(/^price_/, "") };
}

function scheduleFixture(
	subscription: Stripe.Subscription,
): Stripe.SubscriptionSchedule {
	return {
		id: "sub_sched_spec",
		object: "subscription_schedule",
		status: "active",
		subscription: subscription.id,
		current_phase: { start_date: PERIOD_START, end_date: PERIOD_END },
		phases: [
			{
				start_date: PERIOD_START,
				end_date: PERIOD_END,
				items: subscription.items.data.map((item) => ({
					price: expandedPrice(item.price.id),
					quantity: item.quantity,
				})),
			},
		],
	} as unknown as Stripe.SubscriptionSchedule;
}

const unixTime = z.number();

function phasesFrom(
	params: Stripe.SubscriptionScheduleUpdateParams,
): Stripe.SubscriptionSchedule["phases"] {
	let start = PERIOD_START;
	return (params.phases ?? []).map((phase) => {
		const from = unixTime.safeParse(phase.start_date).data ?? start;
		const to = unixTime.safeParse(phase.end_date).data ?? from + 2_600_000;
		start = to;
		return {
			start_date: from,
			end_date: to,
			items: (phase.items ?? []).map((item) => ({
				price: expandedPrice(String(item.price)),
				quantity: item.quantity,
			})),
		} as unknown as Stripe.SubscriptionSchedule["phases"][number];
	});
}

function stubStripe(
	stripe: Stripe,
	live: {
		current: () => Stripe.Subscription;
		update: (params: Stripe.SubscriptionUpdateParams) => Stripe.Subscription;
	},
) {
	return [
		spyOn(stripe.subscriptions, "retrieve").mockImplementation((async () =>
			live.current()) as never),
		spyOn(stripe.customers, "create").mockImplementation((async (
			params: Stripe.CustomerCreateParams,
		) => {
			createdCustomers.push(params);
			return { id: "cus_spec" };
		}) as never),
		spyOn(stripe.customers, "update").mockImplementation((async (
			id: string,
			params: Stripe.CustomerUpdateParams,
		) => {
			updatedCustomers.push({ id, params });
			return { id };
		}) as never),
		spyOn(stripe.customers, "retrieve").mockImplementation((async () => ({
			id: "cus_spec",
			object: "customer",
			invoice_settings: { default_payment_method: null },
		})) as never),
		spyOn(stripe.invoices, "list").mockImplementation((async () => ({
			data: [],
		})) as never),
		spyOn(stripe.invoices, "retrieve").mockImplementation((async (id: string) =>
			invoiceFixture(id, live.current().id)) as never),
		spyOn(stripe.invoices, "createPreview").mockImplementation((async (
			params: Stripe.InvoiceCreatePreviewParams,
		) => {
			previews.push(params);
			return { amount_due: 7_000, total: 7_000, currency: "eur" };
		}) as never),
		spyOn(stripe.prices, "list").mockImplementation((async (
			params: Stripe.PriceListParams,
		) => {
			const key = params.lookup_keys?.[0] ?? "";
			priceLookups.push(key);
			return { data: [{ id: `price_${key}` }] };
		}) as never),
		spyOn(stripe.subscriptions, "update").mockImplementation((async (
			_id: string,
			params: Stripe.SubscriptionUpdateParams,
		) => live.update(params)) as never),
		spyOn(stripe.subscriptionSchedules, "create").mockImplementation((async (
			params: Stripe.SubscriptionScheduleCreateParams,
		) => {
			scheduleCalls.created.push(params);
			schedule = scheduleFixture(live.current());
			live.current().schedule = schedule.id;
			return schedule;
		}) as never),
		spyOn(stripe.subscriptionSchedules, "retrieve").mockImplementation((async (
			id: string,
		) => {
			if (!schedule || schedule.id !== id)
				throw new Error(`No such schedule: ${id}`);
			return schedule;
		}) as never),
		spyOn(stripe.subscriptionSchedules, "update").mockImplementation((async (
			id: string,
			params: Stripe.SubscriptionScheduleUpdateParams,
		) => {
			if (!schedule || schedule.id !== id)
				throw new Error(`No such schedule: ${id}`);
			scheduleCalls.updated.push({ id, params });
			schedule = { ...schedule, phases: phasesFrom(params) };
			return schedule;
		}) as never),
		spyOn(stripe.subscriptionSchedules, "release").mockImplementation((async (
			id: string,
		) => {
			scheduleCalls.released.push(id);
			schedule = null;
			live.current().schedule = null;
			return { id, status: "released" };
		}) as never),
	];
}

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
let mailer: MailService;
let next: Stripe.Subscription | null = null;
let refuseNext = false;
const updates: Stripe.SubscriptionUpdateParams[] = [];

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
	previous?: { items: { data: ReturnType<typeof item>[] } },
) => {
	const payload = JSON.stringify({
		id: `evt_${type}`,
		object: "event",
		type,
		data: previous ? { object, previous_attributes: previous } : { object },
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
	schedule = null;
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
	mailer = app.get(MailService);
	spies.push(
		...stubStripe(stripe, {
			current: () => current,
			update: (params) => {
				if (refuseNext) {
					refuseNext = false;
					throw new Error("This price cannot be added to this subscription.");
				}
				updates.push(params);
				if (next) current = next;
				return current;
			},
		}),
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

const onTenant = async <T>(fn: () => Promise<T>): Promise<T> => {
	const tenant = await tenantById(a.id);
	if (!tenant) throw new Error("tenant a missing");
	return runAsTenant(tenant, fn);
};

const subscribe = async (subscription: Stripe.Subscription) => {
	current = subscription;
	next = null;
	expect((await post("customer.subscription.updated", current)).status).toBe(
		200,
	);
};

describe("the Stripe webhook is the source of truth for the plan", () => {
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
		const invoice = invoiceFixture("in_spec", current.id);
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

	it("ends the trial at checkout: no Stripe trial, full limits from the first payment", async () => {
		await reset();
		const sessions: Stripe.Checkout.SessionCreateParams[] = [];
		const created = spyOn(
			stripe.checkout.sessions,
			"create",
		).mockImplementation((async (
			params: Stripe.Checkout.SessionCreateParams,
		) => {
			sessions.push(params);
			return { url: "https://checkout.stripe.test/cs_spec" };
		}) as never);
		try {
			const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60_000);
			await registryQuery(
				"UPDATE tenant SET trial_ends_at = $2 WHERE id = $1",
				[a.id, inTenDays.toISOString()],
			);
			await registryQuery(
				"UPDATE tenant SET billing = COALESCE(billing, '{}'::jsonb) || $2::jsonb WHERE id = $1",
				[
					a.id,
					JSON.stringify({ wanted: { plan: "start", interval: "month" } }),
				],
			);
			forgetTenant(a.id);
			const wanted = (await tenantById(a.id))?.billing.wanted;
			expect(wanted).toEqual({ plan: "start", interval: "month" });
			if (!wanted) throw new Error("wanted missing");
			const customersBefore = createdCustomers.length;
			const started = await onTenant(() => billing.checkout(OWNER.id, wanted));
			expect(started.url).toBe("https://checkout.stripe.test/cs_spec");
			expect(sessions[0]?.mode).toBe("subscription");
			expect(sessions[0]?.line_items).toEqual([
				{ price: `price_${planLookupKey("start", "month")}`, quantity: 1 },
			]);
			expect(sessions[0]?.subscription_data?.trial_end).toBeUndefined();
			expect(sessions[0]?.success_url).toEndWith(
				`${BILLING.return.path}?${BILLING.return.checkoutParam}=success`,
			);
			expect(sessions[0]?.cancel_url).toEndWith(
				`${BILLING.return.path}?${BILLING.return.checkoutParam}=cancel`,
			);
			expect(sessions[0]?.customer).toBe("cus_spec");
			expect(sessions[0]?.subscription_data?.metadata?.tenantId).toBe(a.id);
			const locale = await onTenant(() => workspaceLocale(db));
			expect(createdCustomers[customersBefore]?.preferred_locales).toEqual([
				BILLING.stripe.locales[locale],
			]);
			expect((await tenantById(a.id))?.billing.customerId).toBe("cus_spec");

			current = subscriptionFixture(a.id, {
				default_payment_method: "pm_card_spec",
				items: { data: [item(planLookupKey("start", "month"))] },
			} as never);
			const updatesBefore = updatedCustomers.length;
			const response = await post("checkout.session.completed", {
				id: "cs_spec",
				object: "checkout.session",
				subscription: current.id,
			} as unknown as Stripe.Checkout.Session);
			expect(response.status).toBe(200);

			const tenant = await tenantById(a.id);
			expect(tenant?.plan).toBe("start");
			expect(tenant?.billing.wanted).toBeNull();
			const limits = await onTenant(() => planLimitsOf(db));
			expect(limits.contacts).toBe(10_000);
			expect(limits.researchSessionsPerMonth).toBe(100);
			expect(limits.chatPerMonth).toBe(500);
			expect(updatedCustomers[updatesBefore]).toEqual({
				id: "cus_spec",
				params: {
					preferred_locales: [BILLING.stripe.locales[locale]],
					invoice_settings: { default_payment_method: "pm_card_spec" },
				},
			});
			const overview = await onTenant(() => billing.overview(OWNER.id));
			expect(overview.state).toBe("active");
		} finally {
			created.mockRestore();
			current = subscriptionFixture(a.id);
			await registryQuery(
				"UPDATE tenant SET trial_ends_at = NULL WHERE id = $1",
				[a.id],
			);
			await reset();
		}
	});

	it("changes the plan through a Stripe subscription update, after a preview", async () => {
		await subscribe(subscriptionFixture(a.id));
		const base = `si_${planLookupKey("standard", "month")}`;
		const plusPrice = `price_${planLookupKey("plus", "month")}`;
		try {
			const preview = await onTenant(() =>
				billing.previewPlan(OWNER.id, { plan: "plus", interval: "month" }),
			);
			expect(preview).toEqual({
				dueNow: 70,
				credit: 0,
				currency: "EUR",
				effectiveAt: null,
			});
			expect(previews.at(-1)?.subscription).toBe("sub_spec");
			expect(previews.at(-1)?.subscription_details).toEqual({
				items: [{ id: base, price: plusPrice }],
				proration_behavior: "always_invoice",
			});

			next = subscriptionFixture(a.id, {
				items: {
					data: [
						item(planLookupKey("plus", "month")),
						item(addOnLookupKey("drafts", "month"), 2),
					],
				},
			});
			const schedulesBefore = scheduleCalls.created.length;
			const changed = await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "plus", interval: "month" }),
			);
			expect(changed.url).toBeNull();
			expect(updates.at(-1)).toEqual({
				items: [{ id: base, price: plusPrice }],
				proration_behavior: "always_invoice",
				payment_behavior: "pending_if_incomplete",
				expand: ["latest_invoice"],
			});
			expect(scheduleCalls.created.length).toBe(schedulesBefore);
			expect((await tenantById(a.id))?.plan).toBe("plus");

			current = next;
			next = {
				...current,
				pending_update: { expires_at: PERIOD_END },
				latest_invoice: {
					id: "in_open",
					object: "invoice",
					hosted_invoice_url: "https://invoice.stripe.test/in_open",
				},
			} as unknown as Stripe.Subscription;
			const unpaid = await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "team", interval: "month" }),
			);
			expect(unpaid.url).toBe("https://invoice.stripe.test/in_open");
			expect((await tenantById(a.id))?.plan).toBe("plus");
		} finally {
			next = null;
			await reset();
		}
	});

	it("switches monthly to yearly when the card sits on the subscription", async () => {
		await subscribe(
			subscriptionFixture(a.id, {
				default_payment_method: cardOnSubscription(),
			} as never),
		);
		try {
			next = subscriptionFixture(a.id, {
				items: {
					data: [
						item(planLookupKey("standard", "year")),
						item(addOnLookupKey("drafts", "year"), 2),
					],
				},
			});
			await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "standard", interval: "year" }),
			);
			expect(updates.at(-1)?.items).toEqual([
				{
					id: `si_${planLookupKey("standard", "month")}`,
					price: `price_${planLookupKey("standard", "year")}`,
				},
				{
					id: `si_${addOnLookupKey("drafts", "month")}`,
					price: `price_${addOnLookupKey("drafts", "year")}`,
				},
			]);
			const tenant = await tenantById(a.id);
			expect(tenant?.billing.interval).toBe("year");
			expect(tenant?.plan).toBe("standard");

			await subscribe(subscriptionFixture(a.id));
			await expect(
				onTenant(() =>
					billing.checkout(OWNER.id, { plan: "standard", interval: "year" }),
				),
			).rejects.toThrow("A yearly plan is paid by card");
		} finally {
			next = null;
			await reset();
		}
	});

	it("puts the add-on on the Stripe subscription and raises the limit", async () => {
		await subscribe(subscriptionFixture(a.id));
		const research = `price_${addOnLookupKey("research", "month")}`;
		try {
			const preview = await onTenant(() =>
				billing.previewAddOn(OWNER.id, { addOn: "research", quantity: 1 }),
			);
			expect(preview.dueNow).toBe(70);
			expect(previews.at(-1)?.subscription_details).toEqual({
				items: [{ price: research, quantity: 1 }],
				proration_behavior: "always_invoice",
			});

			next = subscriptionFixture(a.id, {
				items: {
					data: [
						item(planLookupKey("standard", "month")),
						item(addOnLookupKey("drafts", "month"), 2),
						item(addOnLookupKey("research", "month"), 1),
					],
				},
			});
			await onTenant(() =>
				billing.setAddOn(OWNER.id, { addOn: "research", quantity: 1 }),
			);
			expect(updates.at(-1)).toEqual({
				items: [{ price: research, quantity: 1 }],
				proration_behavior: "always_invoice",
				payment_behavior: "pending_if_incomplete",
				expand: ["latest_invoice"],
			});
			expect((await tenantById(a.id))?.billing.addOns.research).toBe(1);
			const limits = await onTenant(() => planLimitsOf(db));
			expect(limits.researchPerMonth).toBe(150 + 50);

			current = next;
			next = null;
			const previewsBefore = previews.length;
			const updatesBefore = updates.length;
			const lower = await onTenant(() =>
				billing.previewAddOn(OWNER.id, { addOn: "drafts", quantity: 1 }),
			);
			expect(lower).toEqual({
				dueNow: 0,
				credit: 0,
				currency: "EUR",
				effectiveAt: PERIOD_END_ISO,
			});
			expect(previews.length).toBe(previewsBefore);
			await onTenant(() =>
				billing.setAddOn(OWNER.id, { addOn: "drafts", quantity: 1 }),
			);
			expect(updates.length).toBe(updatesBefore);
			expect(scheduleCalls.created.at(-1)).toEqual({
				from_subscription: "sub_spec",
			});
			expect(scheduleCalls.updated.at(-1)?.params.phases?.[1]).toEqual({
				items: [
					{ price: `price_${planLookupKey("standard", "month")}`, quantity: 1 },
					{ price: `price_${addOnLookupKey("drafts", "month")}`, quantity: 1 },
					{ price: research, quantity: 1 },
				],
				duration: { interval: "month", interval_count: 1 },
				proration_behavior: "none",
				automatic_tax: { enabled: true },
			});
			expect((await tenantById(a.id))?.billing.addOns.drafts).toBe(2);
			const overview = await onTenant(() => billing.overview(OWNER.id));
			expect(overview.scheduled?.addOns.drafts).toBe(1);
			expect(overview.scheduled?.plan).toBe("standard");

			const releasedBefore = scheduleCalls.released.length;
			const undoPreview = await onTenant(() =>
				billing.previewAddOn(OWNER.id, { addOn: "drafts", quantity: 3 }),
			);
			expect(undoPreview.dueNow).toBe(0);
			expect(previews.length).toBe(previewsBefore);
			await onTenant(() =>
				billing.setAddOn(OWNER.id, { addOn: "drafts", quantity: 3 }),
			);
			expect(updates.length).toBe(updatesBefore);
			expect(scheduleCalls.released.length).toBe(releasedBefore + 1);
			expect((await tenantById(a.id))?.billing.addOns.drafts).toBe(2);
			expect(
				(await onTenant(() => billing.overview(OWNER.id))).scheduled,
			).toBeNull();

			const logged = spyOn(Logger.prototype, "error");
			refuseNext = true;
			try {
				await expect(
					onTenant(() =>
						billing.setAddOn(OWNER.id, { addOn: "mailbox", quantity: 1 }),
					),
				).rejects.toThrow("Stripe refused this change. Nothing was charged.");
				expect(
					logged.mock.calls.some(([entry]) =>
						JSON.stringify(entry).includes("This price cannot be added"),
					),
				).toBe(true);
			} finally {
				logged.mockRestore();
				refuseNext = false;
			}
		} finally {
			next = null;
			current = subscriptionFixture(a.id);
			await reset();
		}
	});

	it("sends one mail per billing event, and none on a retry", async () => {
		const sent: Mail[] = [];
		const send = spyOn(mailer, "send").mockImplementation(async (mail) => {
			sent.push(mail);
			return true;
		});
		Object.defineProperty(mailer, "configured", {
			get: () => true,
			configurable: true,
		});
		const subscriptionId = `sub_mail_${RUN}`;
		const invoice = invoiceFixture(`in_mail_${RUN}`, subscriptionId);
		const fixture = (over: Partial<Stripe.Subscription> = {}) =>
			subscriptionFixture(a.id, { id: subscriptionId, ...over } as never);
		const twice = async (
			type: string,
			object: Stripe.Subscription | Stripe.Invoice,
		) => {
			expect((await post(type, object)).status).toBe(200);
			expect((await post(type, object)).status).toBe(200);
		};
		const standard = item(planLookupKey("standard", "month"));
		const withDrafts = (quantity: number) => ({
			data: [standard, item(addOnLookupKey("drafts", "month"), quantity)],
		});
		try {
			current = fixture({ latest_invoice: invoice.id });
			await twice("customer.subscription.created", current);
			expect(sent.length).toBe(1);
			expect(sent[0]?.subject).toContain("Standard");
			expect(sent[0]?.html).toContain(
				`https://invoice.stripe.test/${invoice.id}`,
			);
			expect(sent[0]?.html).toContain(
				`https://invoice.stripe.test/${invoice.id}.pdf`,
			);
			await twice("invoice.paid", invoice);
			expect(sent.length).toBe(1);

			for (const quantity of [1, 2, 3, 4, 5]) {
				current = fixture({
					items: withDrafts(quantity),
					latest_invoice: `in_addon_${RUN}_${quantity}`,
				} as never);
				const response = await post(
					"customer.subscription.updated",
					current,
					SECRET,
					{ items: withDrafts(quantity - 1) },
				);
				expect(response.status).toBe(200);
				await post(
					"invoice.paid",
					invoiceFixture(`in_addon_${RUN}_${quantity}`, subscriptionId),
				);
			}
			expect(sent.length).toBe(1);

			current = fixture({
				items: { data: [item(planLookupKey("plus", "month"))] },
				latest_invoice: `in_plus_${RUN}`,
			} as never);
			for (const _round of [1, 2]) {
				await post("customer.subscription.updated", current, SECRET, {
					items: withDrafts(5),
				});
			}
			expect(sent.length).toBe(2);
			expect(sent[1]?.subject).toContain("Plus");

			current = fixture({ status: "past_due" });
			await twice("invoice.payment_failed", invoice);
			expect(sent.length).toBe(3);
			const grace = (await tenantById(a.id))?.graceUntil;
			expect(grace).not.toBeNull();
			expect(sent[2]?.text).toContain("79");

			current = fixture({ cancel_at: PERIOD_END, cancel_at_period_end: true });
			await twice("customer.subscription.updated", current);
			expect(sent.length).toBe(4);

			current = fixture({ status: "canceled" });
			await twice("customer.subscription.deleted", current);
			expect(sent.length).toBe(5);
			expect(new Set(sent.map((mail) => mail.subject)).size).toBe(5);
		} finally {
			send.mockRestore();
			Reflect.deleteProperty(mailer, "configured");
			current = subscriptionFixture(a.id);
			await registryQuery(
				"DELETE FROM billing_mail WHERE tenant_id = $1 AND key LIKE $2",
				[a.id, `%${RUN}%`],
			);
			await reset();
		}
	});

	it("sends nothing and throws nothing without mail settings", async () => {
		const send = spyOn(mailer, "send");
		current = subscriptionFixture(a.id, { latest_invoice: `in_${RUN}` });
		expect(mailer.configured).toBe(false);
		const created = await post("customer.subscription.created", current);
		expect(created.status).toBe(200);
		expect(send).not.toHaveBeenCalled();
		send.mockRestore();
		await reset();
	});

	it("reminds a trial three days before it ends, once", async () => {
		await reset();
		const sent: Mail[] = [];
		const send = spyOn(mailer, "send").mockImplementation(async (mail) => {
			sent.push(mail);
			return true;
		});
		Object.defineProperty(mailer, "configured", {
			get: () => true,
			configurable: true,
		});
		const endsAt = new Date(Date.now() + 2 * 24 * 60 * 60_000);
		const key = `trial-ending:${a.id}:${endsAt.getTime()}`;
		try {
			await registryQuery(
				"UPDATE tenant SET trial_ends_at = $2 WHERE id = $1",
				[a.id, endsAt.toISOString()],
			);
			const sweep = app.get(TenantSweepService);
			const first = await sweep.sweep(new Date());
			const second = await sweep.sweep(new Date());
			expect(first.reminded).toBeGreaterThanOrEqual(1);
			expect(second.reminded).toBe(0);
			expect(sent.length).toBe(first.reminded);
		} finally {
			send.mockRestore();
			Reflect.deleteProperty(mailer, "configured");
			await registryQuery("DELETE FROM billing_mail WHERE key = $1", [key]);
			await registryQuery(
				"UPDATE tenant SET trial_ends_at = NULL WHERE id = $1",
				[a.id],
			);
		}
	});

	it("refuses a plan too small for the mailboxes before any Stripe call", async () => {
		await reset();
		const tenant = await tenantById(a.id);
		if (!tenant) throw new Error("tenant a missing");
		const mailboxes = ["one", "two", "three"].map((name) => ({
			userId: OWNER.id,
			email: `${name}@billing-limit.example`,
			host: "imap.billing-limit.example",
			username: name,
			secret: "not-a-real-secret",
		}));
		const created = spyOn(
			stripe.checkout.sessions,
			"create",
		).mockImplementation((async () => ({
			url: "https://checkout.stripe.test/cs_limit",
		})) as never);
		const warned = spyOn(Logger.prototype, "warn");
		const lookupsBefore = priceLookups.length;
		const previewsBefore = previews.length;
		try {
			expect(await runAsTenant(tenant, () => countMailboxes(db))).toBe(0);
			await runAsTenant(tenant, () =>
				db.imapAccount.createMany({ data: mailboxes }),
			);
			for (const plan of ["hosting", "start"] as const) {
				await expect(
					runAsTenant(tenant, () =>
						billing.checkout(OWNER.id, { plan, interval: "month" }),
					),
				).rejects.toThrow("more contacts or mailboxes than this plan allows");
			}
			await expect(
				runAsTenant(tenant, () =>
					billing.previewPlan(OWNER.id, { plan: "start", interval: "month" }),
				),
			).rejects.toThrow("more contacts or mailboxes than this plan allows");
			expect(priceLookups.length).toBe(lookupsBefore);
			expect(previews.length).toBe(previewsBefore);

			const options = await runAsTenant(tenant, () => billing.plans(OWNER.id));
			expect(
				options.plans.find((option) => option.id === "hosting")?.over,
			).toEqual([{ counter: "mailboxes", used: 3, limit: 2 }]);

			const team = await runAsTenant(tenant, () =>
				billing.checkout(OWNER.id, { plan: "team", interval: "month" }),
			);
			expect(team.url).toBe("https://checkout.stripe.test/cs_limit");

			current = subscriptionFixture(a.id, {
				items: { data: [item(planLookupKey("hosting", "month"))] },
			});
			expect(
				(await post("customer.subscription.updated", current)).status,
			).toBe(200);
			expect((await tenantById(a.id))?.plan).toBe("hosting");
			expect(
				warned.mock.calls.some(([entry]) =>
					JSON.stringify(entry).includes("Plan applied below current usage"),
				),
			).toBe(true);
		} finally {
			created.mockRestore();
			warned.mockRestore();
			current = subscriptionFixture(a.id);
			await reset();
			await runAsTenant(tenant, () =>
				db.imapAccount.deleteMany({
					where: { email: { in: mailboxes.map((row) => row.email) } },
				}),
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

describe("a plan change waits for the paid period", () => {
	it("schedules a downgrade at the period end and changes nothing now", async () => {
		await subscribe(subscriptionFixture(a.id));
		const sent: Mail[] = [];
		const send = spyOn(mailer, "send").mockImplementation(async (mail) => {
			sent.push(mail);
			return true;
		});
		Object.defineProperty(mailer, "configured", {
			get: () => true,
			configurable: true,
		});
		const previewsBefore = previews.length;
		const updatesBefore = updates.length;
		try {
			const preview = await onTenant(() =>
				billing.previewPlan(OWNER.id, { plan: "start", interval: "month" }),
			);
			expect(preview).toEqual({
				dueNow: 0,
				credit: 0,
				currency: "EUR",
				effectiveAt: PERIOD_END_ISO,
			});
			expect(previews.length).toBe(previewsBefore);

			for (const _round of [1, 2]) {
				const changed = await onTenant(() =>
					billing.checkout(OWNER.id, { plan: "start", interval: "month" }),
				);
				expect(changed.url).toBeNull();
			}
			expect(updates.length).toBe(updatesBefore);
			expect(scheduleCalls.created.at(-1)).toEqual({
				from_subscription: "sub_spec",
			});
			const update = scheduleCalls.updated.at(-1);
			expect(update?.id).toBe("sub_sched_spec");
			expect(update?.params.end_behavior).toBe("release");
			expect(update?.params.proration_behavior).toBe("none");
			expect(update?.params.phases).toEqual([
				{
					items: [
						{
							price: `price_${planLookupKey("standard", "month")}`,
							quantity: 1,
						},
						{
							price: `price_${addOnLookupKey("drafts", "month")}`,
							quantity: 2,
						},
					],
					start_date: PERIOD_START,
					end_date: PERIOD_END,
					automatic_tax: { enabled: true },
				},
				{
					items: [
						{ price: `price_${planLookupKey("start", "month")}`, quantity: 1 },
						{
							price: `price_${addOnLookupKey("drafts", "month")}`,
							quantity: 2,
						},
					],
					duration: { interval: "month", interval_count: 1 },
					proration_behavior: "none",
					automatic_tax: { enabled: true },
				},
			]);
			const tenant = await tenantById(a.id);
			expect(tenant?.plan).toBe("standard");
			expect(tenant?.billing.addOns.drafts).toBe(2);
			expect(await onTenant(() => readPlan(db))).toBe("standard");
			expect(sent.length).toBe(1);
			expect(sent[0]?.subject).toContain("2027");
			expect(sent[0]?.text).toContain("Start");

			const overview = await onTenant(() => billing.overview(OWNER.id));
			expect(overview.plan).toBe("standard");
			expect(overview.scheduled).toEqual({
				at: PERIOD_END_ISO,
				plan: "start",
				label: "Start",
				interval: "month",
				addOns: { conversations: 0, drafts: 2, research: 0, mailbox: 0 },
			});

			const createdBefore = scheduleCalls.created.length;
			await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "hosting", interval: "month" }),
			);
			expect(scheduleCalls.created.length).toBe(createdBefore);
			expect(scheduleCalls.updated.at(-1)?.params.phases?.[1]?.items).toEqual([
				{ price: `price_${planLookupKey("hosting", "month")}`, quantity: 1 },
				{ price: `price_${addOnLookupKey("drafts", "month")}`, quantity: 2 },
			]);
			expect(
				(await onTenant(() => billing.overview(OWNER.id))).scheduled?.plan,
			).toBe("hosting");
			expect(sent.length).toBe(2);

			const releasedBefore = scheduleCalls.released.length;
			await onTenant(() => billing.cancelScheduledChange(OWNER.id));
			expect(scheduleCalls.released).toEqual([
				...scheduleCalls.released.slice(0, releasedBefore),
				"sub_sched_spec",
			]);
			expect(
				(await onTenant(() => billing.overview(OWNER.id))).scheduled,
			).toBeNull();
			expect((await tenantById(a.id))?.plan).toBe("standard");
		} finally {
			send.mockRestore();
			Reflect.deleteProperty(mailer, "configured");
			await registryQuery(
				"DELETE FROM billing_mail WHERE tenant_id = $1 AND key LIKE 'scheduled:%'",
				[a.id],
			);
			current = subscriptionFixture(a.id);
			await reset();
		}
	});

	it("schedules yearly to monthly, and releases a schedule before an upgrade", async () => {
		await subscribe(
			subscriptionFixture(a.id, {
				default_payment_method: cardOnSubscription(),
				automatic_tax: { enabled: false },
				items: {
					data: [
						item(planLookupKey("standard", "year")),
						item(addOnLookupKey("drafts", "year"), 2),
					],
				},
			} as never),
		);
		const updatesBefore = updates.length;
		try {
			await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "standard", interval: "month" }),
			);
			expect(updates.length).toBe(updatesBefore);
			expect(scheduleCalls.updated.at(-1)?.params.phases?.[1]).toEqual({
				items: [
					{ price: `price_${planLookupKey("standard", "month")}`, quantity: 1 },
					{ price: `price_${addOnLookupKey("drafts", "month")}`, quantity: 2 },
				],
				duration: { interval: "month", interval_count: 1 },
				proration_behavior: "none",
			});
			expect(
				scheduleCalls.updated.at(-1)?.params.phases?.[0]?.automatic_tax,
			).toBeUndefined();
			expect((await tenantById(a.id))?.billing.interval).toBe("year");

			const releasedBefore = scheduleCalls.released.length;
			next = subscriptionFixture(a.id, {
				items: {
					data: [
						item(planLookupKey("plus", "year")),
						item(addOnLookupKey("drafts", "year"), 2),
					],
				},
			});
			const createdBefore = scheduleCalls.created.length;
			await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "plus", interval: "year" }),
			);
			expect(scheduleCalls.released.length).toBe(releasedBefore + 1);
			expect(updates.at(-1)?.proration_behavior).toBe("always_invoice");
			expect((await tenantById(a.id))?.plan).toBe("plus");
			expect(scheduleCalls.created.length).toBe(createdBefore + 1);
			expect(scheduleCalls.updated.at(-1)?.params.phases?.[1]?.items).toEqual([
				{ price: `price_${planLookupKey("plus", "month")}`, quantity: 1 },
				{ price: `price_${addOnLookupKey("drafts", "month")}`, quantity: 2 },
			]);
			expect(
				(await onTenant(() => billing.overview(OWNER.id))).scheduled,
			).toMatchObject({ plan: "plus", interval: "month" });
		} finally {
			next = null;
			current = subscriptionFixture(a.id);
			await reset();
		}
	});

	it("previews and bills an upgrade while a downgrade waits", async () => {
		await subscribe(subscriptionFixture(a.id));
		const standard = `price_${planLookupKey("standard", "month")}`;
		const plus = `price_${planLookupKey("plus", "month")}`;
		const drafts = `price_${addOnLookupKey("drafts", "month")}`;
		const research = `price_${addOnLookupKey("research", "month")}`;
		try {
			await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "start", interval: "month" }),
			);
			expect(current.schedule).toBe("sub_sched_spec");

			const preview = await onTenant(() =>
				billing.previewPlan(OWNER.id, { plan: "plus", interval: "month" }),
			);
			expect(preview.dueNow).toBe(70);
			expect(previews.at(-1)).toEqual({
				customer: "cus_spec",
				schedule: "sub_sched_spec",
				schedule_details: {
					end_behavior: "release",
					proration_behavior: "always_invoice",
					phases: [
						{
							items: [
								{ price: plus, quantity: 1 },
								{ price: drafts, quantity: 2 },
							],
							start_date: PERIOD_START,
							end_date: PERIOD_END,
							proration_behavior: "always_invoice",
							automatic_tax: { enabled: true },
							trial_end: undefined,
						},
					],
				},
			});

			await onTenant(() =>
				billing.previewAddOn(OWNER.id, { addOn: "research", quantity: 1 }),
			);
			expect(previews.at(-1)?.schedule_details?.phases?.[0]?.items).toEqual([
				{ price: standard, quantity: 1 },
				{ price: drafts, quantity: 2 },
				{ price: research, quantity: 1 },
			]);

			const releasedBefore = scheduleCalls.released.length;
			const createdBefore = scheduleCalls.created.length;
			next = subscriptionFixture(a.id, {
				items: {
					data: [
						item(planLookupKey("plus", "month")),
						item(addOnLookupKey("drafts", "month"), 2),
					],
				},
			});
			await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "plus", interval: "month" }),
			);
			expect(scheduleCalls.released.length).toBe(releasedBefore + 1);
			expect(scheduleCalls.created.length).toBe(createdBefore);
			expect(updates.at(-1)?.proration_behavior).toBe("always_invoice");
			expect((await tenantById(a.id))?.plan).toBe("plus");
			next = null;
			const overview = await onTenant(() => billing.overview(OWNER.id));
			expect(overview.scheduled).toBeNull();
			await onTenant(() =>
				billing.previewPlan(OWNER.id, { plan: "team", interval: "month" }),
			);
			expect(previews.at(-1)?.subscription).toBe("sub_spec");
			expect(previews.at(-1)?.schedule).toBeUndefined();
		} finally {
			next = null;
			current = subscriptionFixture(a.id);
			await registryQuery(
				"DELETE FROM billing_mail WHERE tenant_id = $1 AND key LIKE 'scheduled:%'",
				[a.id],
			);
			await reset();
		}
	});

	it("keeps every scheduled reduction when a downgrade joins it, and the other way round", async () => {
		await subscribe(
			subscriptionFixture(a.id, {
				default_payment_method: cardOnSubscription(),
				items: {
					data: [
						item(planLookupKey("office", "year")),
						item(addOnLookupKey("conversations", "year"), 1),
						item(addOnLookupKey("drafts", "year"), 1),
					],
				},
			} as never),
		);
		const office = `price_${planLookupKey("office", "year")}`;
		const start = `price_${planLookupKey("start", "year")}`;
		const conversations = `price_${addOnLookupKey("conversations", "year")}`;
		const updatesBefore = updates.length;
		try {
			await onTenant(() =>
				billing.setAddOn(OWNER.id, { addOn: "drafts", quantity: 0 }),
			);
			expect(scheduleCalls.updated.at(-1)?.params.phases?.[1]?.items).toEqual([
				{ price: office, quantity: 1 },
				{ price: conversations, quantity: 1 },
			]);

			const createdBefore = scheduleCalls.created.length;
			await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "start", interval: "year" }),
			);
			expect(scheduleCalls.created.length).toBe(createdBefore);
			const phases = scheduleCalls.updated.at(-1)?.params.phases;
			expect(phases?.[1]?.items).toEqual([
				{ price: start, quantity: 1 },
				{ price: conversations, quantity: 1 },
			]);
			expect(phases?.[0]?.automatic_tax).toEqual({ enabled: true });
			expect(phases?.[1]?.automatic_tax).toEqual({ enabled: true });

			await onTenant(() =>
				billing.setAddOn(OWNER.id, { addOn: "conversations", quantity: 0 }),
			);
			expect(scheduleCalls.updated.at(-1)?.params.phases?.[1]?.items).toEqual([
				{ price: start, quantity: 1 },
			]);
			expect(updates.length).toBe(updatesBefore);
			expect(
				(await onTenant(() => billing.overview(OWNER.id))).scheduled,
			).toEqual({
				at: PERIOD_END_ISO,
				plan: "start",
				label: "Start",
				interval: "year",
				addOns: { conversations: 0, drafts: 0, research: 0, mailbox: 0 },
			});
		} finally {
			current = subscriptionFixture(a.id);
			await registryQuery(
				"DELETE FROM billing_mail WHERE tenant_id = $1 AND key LIKE 'scheduled:%'",
				[a.id],
			);
			await reset();
		}
	});

	it("bills an add-on now and keeps the scheduled downgrade, and a plus on a reduced add-on only cancels the reduction", async () => {
		await subscribe(subscriptionFixture(a.id));
		const standard = `price_${planLookupKey("standard", "month")}`;
		const start = `price_${planLookupKey("start", "month")}`;
		const drafts = `price_${addOnLookupKey("drafts", "month")}`;
		const research = `price_${addOnLookupKey("research", "month")}`;
		try {
			await onTenant(() =>
				billing.checkout(OWNER.id, { plan: "start", interval: "month" }),
			);
			await onTenant(() =>
				billing.setAddOn(OWNER.id, { addOn: "drafts", quantity: 1 }),
			);
			expect(scheduleCalls.updated.at(-1)?.params.phases?.[1]?.items).toEqual([
				{ price: start, quantity: 1 },
				{ price: drafts, quantity: 1 },
			]);

			const releasedBefore = scheduleCalls.released.length;
			const createdBefore = scheduleCalls.created.length;
			const updatesBefore = updates.length;
			next = subscriptionFixture(a.id, {
				items: {
					data: [
						item(planLookupKey("standard", "month")),
						item(addOnLookupKey("drafts", "month"), 2),
						item(addOnLookupKey("research", "month"), 1),
					],
				},
			});
			await onTenant(() =>
				billing.setAddOn(OWNER.id, { addOn: "research", quantity: 1 }),
			);
			next = null;
			expect(updates.length).toBe(updatesBefore + 1);
			expect(updates.at(-1)).toEqual({
				items: [{ price: research, quantity: 1 }],
				proration_behavior: "always_invoice",
				payment_behavior: "pending_if_incomplete",
				expand: ["latest_invoice"],
			});
			expect(scheduleCalls.released.length).toBe(releasedBefore + 1);
			expect(scheduleCalls.created.length).toBe(createdBefore + 1);
			const phases = scheduleCalls.updated.at(-1)?.params.phases;
			expect(phases?.[0]?.items).toEqual([
				{ price: standard, quantity: 1 },
				{ price: drafts, quantity: 2 },
				{ price: research, quantity: 1 },
			]);
			expect(phases?.[1]?.items).toEqual([
				{ price: start, quantity: 1 },
				{ price: drafts, quantity: 1 },
				{ price: research, quantity: 1 },
			]);
			expect(phases?.[0]?.automatic_tax).toEqual({ enabled: true });
			expect(phases?.[1]?.automatic_tax).toEqual({ enabled: true });
			expect((await tenantById(a.id))?.billing.addOns.research).toBe(1);

			const previewsBefore = previews.length;
			expect(
				await onTenant(() =>
					billing.previewAddOn(OWNER.id, { addOn: "drafts", quantity: 3 }),
				),
			).toMatchObject({ dueNow: 0, credit: 0 });
			expect(previews.length).toBe(previewsBefore);
			await onTenant(() =>
				billing.setAddOn(OWNER.id, { addOn: "drafts", quantity: 3 }),
			);
			expect(updates.length).toBe(updatesBefore + 1);
			expect(scheduleCalls.released.length).toBe(releasedBefore + 1);
			expect(scheduleCalls.updated.at(-1)?.params.phases?.[1]?.items).toEqual([
				{ price: start, quantity: 1 },
				{ price: drafts, quantity: 2 },
				{ price: research, quantity: 1 },
			]);
			expect(
				(await onTenant(() => billing.overview(OWNER.id))).scheduled,
			).toMatchObject({ plan: "start", addOns: { drafts: 2, research: 1 } });
		} finally {
			next = null;
			current = subscriptionFixture(a.id);
			await registryQuery(
				"DELETE FROM billing_mail WHERE tenant_id = $1 AND key LIKE 'scheduled:%'",
				[a.id],
			);
			await reset();
		}
	});

	it("applies the scheduled plan once when the phase switches, and mails once", async () => {
		await subscribe(subscriptionFixture(a.id));
		const sent: Mail[] = [];
		const send = spyOn(mailer, "send").mockImplementation(async (mail) => {
			sent.push(mail);
			return true;
		});
		Object.defineProperty(mailer, "configured", {
			get: () => true,
			configurable: true,
		});
		const invoice = `in_switch_${RUN}`;
		try {
			current = subscriptionFixture(a.id, {
				items: {
					data: [
						item(planLookupKey("start", "month")),
						item(addOnLookupKey("drafts", "month"), 2),
					],
				},
				latest_invoice: invoice,
			} as never);
			for (const _round of [1, 2]) {
				const response = await post(
					"customer.subscription.updated",
					current,
					SECRET,
					{
						items: {
							data: [
								item(planLookupKey("standard", "month")),
								item(addOnLookupKey("drafts", "month"), 2),
							],
						},
					},
				);
				expect(response.status).toBe(200);
			}
			const tenant = await tenantById(a.id);
			expect(tenant?.plan).toBe("start");
			expect(tenant?.billing.addOns.drafts).toBe(2);
			expect(await onTenant(() => readPlan(db))).toBe("start");
			expect(sent.length).toBe(1);
			expect(sent[0]?.subject).toContain("Start");
		} finally {
			send.mockRestore();
			Reflect.deleteProperty(mailer, "configured");
			await registryQuery(
				"DELETE FROM billing_mail WHERE tenant_id = $1 AND key LIKE $2",
				[a.id, `%${RUN}%`],
			);
			current = subscriptionFixture(a.id);
			await reset();
		}
	});
});
