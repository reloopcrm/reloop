import { appUrl, isWorkspaceAdmin, workspaceRoleOf } from "@crm/auth";
import type { Db } from "@crm/db";
import { planLimitsOf } from "@crm/db/plan-usage";
import {
	ADD_ON_IDS,
	type AddOnId,
	type AddOnQuantities,
	type CapacityExcess,
	type CapacityUsage,
	canonicalPlanId,
	capacityExcess,
	NO_ADD_ONS,
	PLANS,
	withAddOns,
} from "@crm/db/plans";
import {
	addOnLookupKey,
	type BillingInterval,
	PAID_PLAN_IDS,
	type PaidPlanId,
	PRICING_EUR,
	parseLookupKey,
	planLookupKey,
} from "@crm/db/pricing";
import { writePlan } from "@crm/db/settings";
import {
	type BillingStatus,
	forgetTenant,
	setTenantStatus,
	type Tenant,
	type TenantBilling,
	tenantByCustomer,
	tenantById,
	writeTenantBilling,
} from "@crm/db/tenancy";
import { TENANCY } from "@crm/db/tenancy-config";
import {
	currentTenant,
	isHostedCustomer,
	runAsTenant,
} from "@crm/db/tenant-context";
import {
	BadRequestException,
	ForbiddenException,
	Inject,
	Injectable,
	Logger,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Stripe from "stripe";
import { z } from "zod";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import {
	BillingMailService,
	ownerEmail,
	workspaceLocale,
} from "../mail/billing-mail.service";
import type { MailAmount } from "../mail/billing-mail-copy";
import { readCapacityUsage } from "../mailbox/sync-state.service";
import { BILLING } from "./billing.config";
import type {
	BillingOverview,
	BillingPlans,
	BillingState,
	ChangePreview,
	CheckoutInput,
	PortalInput,
	SetAddOnInput,
} from "./billing.contracts";
import { STRIPE, type StripeClient } from "./stripe.provider";

const DAY_MS = 24 * 60 * 60_000;

const expandableId = z.union([
	z.string(),
	z.object({ id: z.string() }).transform((object) => object.id),
]);

function idOf(
	value: string | { id: string } | null | undefined,
): string | null {
	return value ? expandableId.parse(value) : null;
}

const expandedObject = z.object({ id: z.string(), object: z.string() });

function expanded<T extends { id: string; object: string }>(
	value: string | T | null | undefined,
): T | null {
	return expandedObject.safeParse(value).success ? (value as T) : null;
}

const stripeInvoice = z.object({
	id: z.string(),
	hosted_invoice_url: z.string().nullish(),
	invoice_pdf: z.string().nullish(),
	amount_due: z.number(),
	currency: z.string(),
	attempt_count: z.number().default(0),
});

type StripeInvoice = z.infer<typeof stripeInvoice>;

type PaymentMethodView = NonNullable<BillingOverview["paymentMethod"]>;

type ChangeItem = {
	id?: string;
	price?: string;
	quantity?: number;
	deleted?: boolean;
};

type Change = {
	items: ChangeItem[];
	proration_behavior: "always_invoice" | "create_prorations";
	trial_end?: "now";
};

export type SubscriptionState = {
	plan: PaidPlanId | null;
	interval: BillingInterval | null;
	addOns: AddOnQuantities;
	paidUntil: Date | null;
	status: BillingStatus;
	cancelAt: Date | null;
	customerId: string | null;
	subscriptionId: string;
};

export function subscriptionState(
	subscription: Stripe.Subscription,
): SubscriptionState {
	const addOns: AddOnQuantities = { ...NO_ADD_ONS };
	let plan: PaidPlanId | null = null;
	let interval: BillingInterval | null = null;
	let paidUntil: Date | null = null;

	for (const item of subscription.items.data) {
		const parsed = parseLookupKey(item.price.lookup_key);
		if (!parsed) continue;
		if (parsed.kind === "plan") {
			plan = parsed.plan;
			interval = parsed.interval;
			paidUntil = new Date(item.current_period_end * 1000);
		} else {
			addOns[parsed.addOn] += item.quantity ?? 1;
		}
	}

	const status: BillingStatus =
		subscription.status === "active" || subscription.status === "trialing"
			? "active"
			: subscription.status === "past_due" || subscription.status === "unpaid"
				? "past_due"
				: subscription.status === "canceled" ||
						subscription.status === "incomplete_expired"
					? "canceled"
					: "none";

	return {
		plan,
		interval,
		addOns,
		paidUntil,
		status,
		cancelAt: subscription.cancel_at
			? new Date(subscription.cancel_at * 1000)
			: null,
		customerId: idOf(subscription.customer),
		subscriptionId: subscription.id,
	};
}

export function planChangeExcess(
	plan: PaidPlanId,
	current: string | null,
	addOns: AddOnQuantities,
	usage: CapacityUsage,
): CapacityExcess[] {
	if (plan === canonicalPlanId(current)) return [];
	return capacityExcess(usage, withAddOns(PLANS[plan], addOns));
}

export function deleteAtOf(
	tenant: Pick<Tenant, "status" | "suspendedAt">,
): Date | null {
	if (tenant.status !== "suspended" || !tenant.suspendedAt) return null;
	return new Date(tenant.suspendedAt.getTime() + TENANCY.trial.suspendedTtlMs);
}

export function billingStateOf(tenant: Tenant): BillingState {
	const { status, cancelAt } = tenant.billing;
	if (status === "active") return cancelAt ? "canceling" : "active";
	if (status === "past_due") return "past_due";
	return canonicalPlanId(tenant.plan) === "trial" ? "trial" : "none";
}

export function paymentMethodOf(
	subscription: Pick<Stripe.Subscription, "default_payment_method"> | null,
	customer: Pick<Stripe.Customer, "invoice_settings"> | null,
): PaymentMethodView | null {
	return (
		paymentMethodView(expanded(subscription?.default_payment_method)) ??
		paymentMethodView(
			expanded(customer?.invoice_settings?.default_payment_method),
		)
	);
}

export function pendingPaymentUrl(
	subscription: Stripe.Subscription,
): string | null {
	if (!subscription.pending_update) return null;
	return expanded(subscription.latest_invoice)?.hosted_invoice_url ?? null;
}

function subscriptionIdOf(event: Stripe.Event): string | null {
	const object = event.data.object;
	switch (event.type) {
		case "checkout.session.completed":
			return idOf((object as Stripe.Checkout.Session).subscription);
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted":
			return (object as Stripe.Subscription).id;
		case "invoice.paid":
		case "invoice.payment_failed":
			return idOf(
				(object as Stripe.Invoice).parent?.subscription_details?.subscription,
			);
		default:
			return null;
	}
}

@Injectable()
export class BillingService {
	private readonly logger = new Logger(BillingService.name);
	private readonly webhookSecret: string | undefined;
	private readonly prices = new Map<string, string>();
	private portalConfiguration: string | null | undefined;

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(STRIPE) private readonly stripe: StripeClient,
		config: ConfigService<EnvironmentVariables, true>,
		private readonly mails: BillingMailService,
	) {
		this.webhookSecret = config
			.get("STRIPE_WEBHOOK_SECRET", { infer: true })
			?.trim();
	}

	get configured(): boolean {
		return this.stripe !== null && Boolean(this.webhookSecret);
	}

	async verify(
		payload: Buffer,
		signature: string | undefined,
	): Promise<Stripe.Event> {
		if (!this.stripe || !this.webhookSecret) {
			throw new ServiceUnavailableException();
		}
		try {
			return await this.stripe.webhooks.constructEventAsync(
				payload,
				signature ?? "",
				this.webhookSecret,
				BILLING.webhook.toleranceSeconds,
			);
		} catch {
			throw new BadRequestException();
		}
	}

	async handleEvent(event: Stripe.Event): Promise<void> {
		const subscriptionId = subscriptionIdOf(event);
		if (!subscriptionId) {
			this.logger.log({ message: "Billing event ignored", type: event.type });
			return;
		}

		const subscription =
			await this.requireStripe().subscriptions.retrieve(subscriptionId);
		const tenant = await this.tenantOf(subscription);
		if (!tenant) {
			this.logger.warn({
				message: "Billing event for an unknown tenant",
				type: event.type,
				subscriptionId,
			});
			return;
		}

		await this.applySubscription(tenant, subscription);
		if (
			event.type === "checkout.session.completed" ||
			event.type === "customer.subscription.updated"
		) {
			await this.syncCustomer(tenant, subscription);
		}
		try {
			await this.mailAbout(event, tenant.id, subscription);
		} catch (error) {
			this.logger.error(
				{
					message: "Billing mail failed",
					type: event.type,
					tenantId: tenant.id,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
		this.logger.log({
			message: "Billing event applied",
			type: event.type,
			tenantId: tenant.id,
			status: subscription.status,
		});
	}

	async applySubscription(
		tenant: Tenant,
		subscription: Stripe.Subscription,
		now: Date = new Date(),
	): Promise<void> {
		const state = subscriptionState(subscription);
		const known = tenant.billing.subscriptionId;
		if (
			known &&
			known !== state.subscriptionId &&
			state.status === "canceled"
		) {
			return;
		}

		const billing: TenantBilling = {
			customerId: state.customerId ?? tenant.billing.customerId,
			subscriptionId: state.subscriptionId,
			status: state.status,
			interval: state.interval,
			cancelAt: state.cancelAt,
			addOns: state.addOns,
		};

		if (state.status === "canceled") {
			await writeTenantBilling(tenant.id, {
				plan: tenant.plan,
				paidUntil: null,
				graceUntil: null,
				billing: { ...billing, cancelAt: null, addOns: { ...NO_ADD_ONS } },
			});
			if (tenant.status === "active") {
				await setTenantStatus(tenant.id, "suspended");
			}
			return;
		}

		const plan = state.plan ?? tenant.plan;
		const graceUntil =
			state.status === "past_due"
				? (tenant.graceUntil ??
					new Date(now.getTime() + TENANCY.billing.graceMs))
				: null;

		await writeTenantBilling(tenant.id, {
			plan,
			paidUntil: state.paidUntil,
			graceUntil,
			billing,
		});
		await runAsTenant(tenant, () => writePlan(this.db, plan));
		if (state.plan) await this.warnBelowUsage(tenant, state.plan, state.addOns);
		if (tenant.status === "suspended" && state.status === "active") {
			await setTenantStatus(tenant.id, "active");
		}
		forgetTenant(tenant.id);
	}

	async overview(userId: string): Promise<BillingOverview> {
		await this.assertManager(userId);
		if (!isHostedCustomer()) return this.singleTenantOverview();

		const tenant = await this.freshTenant();
		const limits = await planLimitsOf(this.db);
		const plan = canonicalPlanId(tenant.plan);
		const interval = tenant.billing.interval;
		const price =
			plan && plan !== "trial" && interval
				? PRICING_EUR.plans[plan][interval === "year" ? "yearly" : "monthly"]
				: null;

		const overview: BillingOverview = {
			configured: this.configured,
			hosted: true,
			plan,
			label: limits.label,
			interval,
			price,
			state: billingStateOf(tenant),
			trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
			paidUntil: tenant.paidUntil?.toISOString() ?? null,
			cancelAt: tenant.billing.cancelAt?.toISOString() ?? null,
			graceUntil: tenant.graceUntil?.toISOString() ?? null,
			suspended: tenant.status === "suspended",
			deleteAt: deleteAtOf(tenant)?.toISOString() ?? null,
			deletionDays: Math.round(TENANCY.trial.suspendedTtlMs / DAY_MS),
			addOns: tenant.billing.addOns,
			limits: this.limitsSummary(limits),
			addOnCatalog: this.addOnCatalog(),
			paymentMethod: null,
			address: null,
			invoices: [],
			stripeReachable: true,
		};

		const customerId = tenant.billing.customerId;
		if (!this.stripe || !customerId) return overview;

		try {
			const subscriptionId = tenant.billing.subscriptionId;
			const [customer, invoices, subscription] = await Promise.all([
				this.stripe.customers.retrieve(customerId, {
					expand: ["invoice_settings.default_payment_method"],
				}),
				this.stripe.invoices.list({
					customer: customerId,
					limit: BILLING.invoices.limit,
				}),
				subscriptionId
					? this.stripe.subscriptions.retrieve(subscriptionId, {
							expand: ["default_payment_method"],
						})
					: null,
			]);
			const live = customer.deleted ? null : customer;
			overview.paymentMethod = paymentMethodOf(subscription, live);
			if (live) overview.address = addressOf(live);
			overview.invoices = invoices.data.map((invoice) => ({
				id: invoice.id,
				date: new Date(invoice.created * 1000).toISOString(),
				amount: invoice.total / BILLING.stripe.centsPerUnit,
				currency: invoice.currency.toUpperCase(),
				status: invoice.status ?? "draft",
				url: invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? null,
			}));
		} catch (error) {
			overview.stripeReachable = false;
			this.logger.error(
				{ message: "Stripe did not answer", tenantId: tenant.id },
				error instanceof Error ? error.stack : String(error),
			);
		}

		return overview;
	}

	async plans(userId: string): Promise<BillingPlans> {
		await this.assertManager(userId);
		const tenant = isHostedCustomer() ? await this.freshTenant() : null;
		const usage = await readCapacityUsage(this.db);
		const addOns = tenant?.billing.addOns ?? NO_ADD_ONS;
		const current = tenant?.plan ?? null;
		return {
			plans: PAID_PLAN_IDS.map((id) => {
				const limits = withAddOns(PLANS[id], addOns);
				return {
					id,
					label: limits.label,
					monthly: PRICING_EUR.plans[id].monthly,
					yearly: PRICING_EUR.plans[id].yearly,
					aiIncluded: limits.aiIncluded,
					contacts: limits.contacts,
					mailboxes: limits.mailboxes,
					storageGb: limits.storageGb,
					over: planChangeExcess(id, current, addOns, usage),
				};
			}),
		};
	}

	async previewPlan(
		userId: string,
		input: CheckoutInput,
	): Promise<ChangePreview> {
		await this.assertManager(userId);
		const tenant = await this.freshTenant();
		await this.assertPlanFits(tenant, input);
		const subscription = await this.requireSubscription(tenant);
		return this.preview(
			subscription,
			await this.planChange(tenant, subscription, input),
		);
	}

	async previewAddOn(
		userId: string,
		input: SetAddOnInput,
	): Promise<ChangePreview> {
		await this.assertManager(userId);
		const tenant = await this.freshTenant();
		const subscription = await this.requireSubscription(tenant);
		const change = await this.addOnChange(subscription, input);
		if (!change || change.proration_behavior !== "always_invoice") {
			return {
				dueNow: 0,
				credit: 0,
				currency: PRICING_EUR.currency.toUpperCase(),
			};
		}
		return this.preview(subscription, change);
	}

	async checkout(
		userId: string,
		input: CheckoutInput,
	): Promise<{ url: string | null }> {
		await this.assertManager(userId);
		const stripe = this.requireStripe();
		const tenant = await this.freshTenant();
		await this.assertPlanFits(tenant, input);
		const subscription = await this.activeSubscription(tenant);

		if (subscription) {
			const change = await this.planChange(tenant, subscription, input);
			if (subscription.cancel_at_period_end) {
				await stripe.subscriptions.update(subscription.id, {
					cancel_at_period_end: false,
				});
			}
			const updated = await stripe.subscriptions.update(subscription.id, {
				...change,
				payment_behavior: "pending_if_incomplete",
				expand: ["latest_invoice"],
			});
			await this.applySubscription(tenant, updated);
			return { url: pendingPaymentUrl(updated) };
		}

		const price = await this.priceId(planLookupKey(input.plan, input.interval));
		const customer =
			tenant.billing.customerId ?? (await this.createCustomer(tenant, userId));
		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			line_items: [{ price, quantity: 1 }],
			customer,
			customer_update: { address: "auto", name: "auto" },
			client_reference_id: tenant.id,
			metadata: { tenantId: tenant.id },
			subscription_data: { metadata: { tenantId: tenant.id } },
			automatic_tax: { enabled: true },
			billing_address_collection: "required",
			tax_id_collection: { enabled: true },
			payment_method_types: input.interval === "year" ? ["card"] : undefined,
			locale: "auto",
			success_url: `${this.returnUrl()}?${BILLING.return.checkoutParam}=success`,
			cancel_url: this.returnUrl(),
		});
		return { url: session.url };
	}

	async setAddOn(
		userId: string,
		input: SetAddOnInput,
	): Promise<{ url: string | null }> {
		await this.assertManager(userId);
		const stripe = this.requireStripe();
		const tenant = await this.freshTenant();
		const subscription = await this.requireSubscription(tenant);
		const change = await this.addOnChange(subscription, input);
		if (!change) return { url: null };

		const updated = await stripe.subscriptions.update(
			subscription.id,
			change.proration_behavior === "always_invoice"
				? {
						...change,
						payment_behavior: "pending_if_incomplete",
						expand: ["latest_invoice"],
					}
				: change,
		);
		await this.applySubscription(tenant, updated);
		return { url: pendingPaymentUrl(updated) };
	}

	async cancel(userId: string): Promise<{ ok: true }> {
		return this.setCancel(userId, true);
	}

	async resume(userId: string): Promise<{ ok: true }> {
		return this.setCancel(userId, false);
	}

	async portal(userId: string, input: PortalInput): Promise<{ url: string }> {
		await this.assertManager(userId);
		const stripe = this.requireStripe();
		const tenant = await this.freshTenant();
		const customer = tenant.billing.customerId;
		if (!customer) {
			throw new BadRequestException(
				"Choose a plan first. Add-ons and billing details follow the first payment.",
			);
		}

		const session = await stripe.billingPortal.sessions.create({
			customer,
			configuration: (await this.portalConfigurationId()) ?? undefined,
			return_url: this.returnUrl(),
			flow_data:
				input.flow === "payment_method"
					? { type: "payment_method_update" }
					: undefined,
		});
		return { url: session.url };
	}

	private async setCancel(
		userId: string,
		cancel: boolean,
	): Promise<{ ok: true }> {
		await this.assertManager(userId);
		const stripe = this.requireStripe();
		const tenant = await this.freshTenant();
		const subscription = await this.requireSubscription(tenant);

		const updated = await stripe.subscriptions.update(subscription.id, {
			cancel_at_period_end: cancel,
		});
		await this.applySubscription(tenant, updated);
		return { ok: true };
	}

	private async assertPlanFits(
		tenant: Tenant,
		input: CheckoutInput,
	): Promise<void> {
		const excess = planChangeExcess(
			input.plan,
			tenant.plan,
			tenant.billing.addOns,
			await readCapacityUsage(this.db),
		);
		if (excess.length > 0) {
			throw new BadRequestException(
				"Your workspace holds more contacts or mailboxes than this plan allows. Remove some first, or choose a bigger plan.",
			);
		}
	}

	private async planChange(
		tenant: Tenant,
		subscription: Stripe.Subscription,
		input: CheckoutInput,
	): Promise<Change> {
		const base = subscription.items.data.find(
			(item) => parseLookupKey(item.price.lookup_key)?.kind === "plan",
		);
		if (!base)
			throw new BadRequestException(
				"Your subscription has no plan item. Contact support.",
			);
		if (
			input.interval === "year" &&
			(await this.paymentMethod(tenant, subscription))?.kind !== "card"
		) {
			throw new BadRequestException(
				"A yearly plan is paid by card. Add a card under Payment first.",
			);
		}
		const items: ChangeItem[] = [
			{
				id: base.id,
				price: await this.priceId(planLookupKey(input.plan, input.interval)),
			},
		];
		if (input.interval !== intervalOf(subscription)) {
			for (const item of subscription.items.data) {
				const parsed = parseLookupKey(item.price.lookup_key);
				if (parsed?.kind !== "addon") continue;
				items.push({
					id: item.id,
					price: await this.priceId(
						addOnLookupKey(parsed.addOn, input.interval),
					),
				});
			}
		}
		return charging(subscription, items);
	}

	private async addOnChange(
		subscription: Stripe.Subscription,
		input: SetAddOnInput,
	): Promise<Change | null> {
		const current = subscriptionState(subscription).addOns[input.addOn];
		if (input.quantity === current) return null;
		const existing = subscription.items.data.find((item) => {
			const parsed = parseLookupKey(item.price.lookup_key);
			return parsed?.kind === "addon" && parsed.addOn === input.addOn;
		});
		const item: ChangeItem = existing
			? input.quantity === 0
				? { id: existing.id, deleted: true }
				: { id: existing.id, quantity: input.quantity }
			: {
					price: await this.priceId(
						addOnLookupKey(input.addOn, intervalOf(subscription)),
					),
					quantity: input.quantity,
				};
		return input.quantity > current
			? charging(subscription, [item])
			: { items: [item], proration_behavior: "create_prorations" };
	}

	private async preview(
		subscription: Stripe.Subscription,
		change: Change,
	): Promise<ChangePreview> {
		const invoice = await this.requireStripe().invoices.createPreview({
			customer: idOf(subscription.customer) ?? undefined,
			subscription: subscription.id,
			subscription_details: change,
		});
		return {
			dueNow: invoice.amount_due / BILLING.stripe.centsPerUnit,
			credit: Math.max(0, -invoice.total) / BILLING.stripe.centsPerUnit,
			currency: invoice.currency.toUpperCase(),
		};
	}

	private async createCustomer(
		tenant: Tenant,
		userId: string,
	): Promise<string> {
		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: { email: true },
		});
		const customer = await this.requireStripe().customers.create({
			email: (await ownerEmail(this.db)) ?? user?.email,
			preferred_locales: [await this.stripeLocale(tenant)],
			metadata: { tenantId: tenant.id },
		});
		await writeTenantBilling(tenant.id, {
			plan: tenant.plan,
			paidUntil: tenant.paidUntil,
			graceUntil: tenant.graceUntil,
			billing: { ...tenant.billing, customerId: customer.id },
		});
		return customer.id;
	}

	private async syncCustomer(
		tenant: Tenant,
		subscription: Stripe.Subscription,
	): Promise<void> {
		const customerId = idOf(subscription.customer);
		if (!customerId) return;
		const method = idOf(subscription.default_payment_method);
		try {
			const params: Stripe.CustomerUpdateParams = {
				preferred_locales: [await this.stripeLocale(tenant)],
			};
			if (method) params.invoice_settings = { default_payment_method: method };
			await this.requireStripe().customers.update(customerId, params);
		} catch (error) {
			this.logger.error(
				{ message: "Stripe customer was not updated", tenantId: tenant.id },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private async stripeLocale(tenant: Tenant): Promise<string> {
		const locale = await runAsTenant(tenant, () => workspaceLocale(this.db));
		return BILLING.stripe.locales[locale];
	}

	private async mailAbout(
		event: Stripe.Event,
		tenantId: string,
		subscription: Stripe.Subscription,
	): Promise<void> {
		const tenant = await tenantById(tenantId);
		if (!tenant || tenant.billing.subscriptionId !== subscription.id) return;
		const state = subscriptionState(subscription);
		const plan = state.plan ? PLANS[state.plan].label : null;

		switch (event.type) {
			case "invoice.paid": {
				const invoice = stripeInvoice.parse(event.data.object);
				await this.mails.send(tenant, `paid:${invoice.id}`, "paid", {
					plan,
					invoiceUrl: invoice.hosted_invoice_url,
					pdfUrl: invoice.invoice_pdf,
				});
				return;
			}
			case "invoice.payment_failed": {
				const invoice = stripeInvoice.parse(event.data.object);
				await this.mails.send(
					tenant,
					`failed:${invoice.id}:${invoice.attempt_count}`,
					"failed",
					{
						plan,
						amount: amountOf(invoice),
						date: tenant.graceUntil,
						invoiceUrl: invoice.hosted_invoice_url,
					},
				);
				return;
			}
			case "customer.subscription.deleted":
				if (state.status !== "canceled") return;
				await this.mails.send(tenant, `ended:${subscription.id}`, "ended", {
					date: deleteAtOf(tenant),
				});
				return;
			case "customer.subscription.created":
			case "customer.subscription.updated":
				if (state.status !== "active" || !state.cancelAt) return;
				await this.mails.send(
					tenant,
					`ending:${subscription.id}:${state.cancelAt.getTime()}`,
					"ending",
					{
						plan,
						date: state.cancelAt,
						days: Math.round(TENANCY.trial.suspendedTtlMs / DAY_MS),
					},
				);
				return;
			default:
				return;
		}
	}

	private async assertManager(userId: string): Promise<void> {
		if (!isWorkspaceAdmin(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a workspace admin can change these settings.",
			);
		}
	}

	private requireStripe(): Stripe {
		this.requireHosted();
		if (!this.stripe) {
			throw new ServiceUnavailableException(
				"Billing is not set up on this install.",
			);
		}
		return this.stripe;
	}

	private requireHosted(): void {
		if (!isHostedCustomer()) {
			throw new ForbiddenException(
				"Billing is only offered on the hosted Cloud.",
			);
		}
	}

	private async freshTenant(): Promise<Tenant> {
		this.requireHosted();
		const current = currentTenant();
		forgetTenant(current.id);
		return (await tenantById(current.id)) ?? current;
	}

	private async tenantOf(
		subscription: Stripe.Subscription,
	): Promise<Tenant | null> {
		const tenantId = subscription.metadata?.tenantId;
		const byId = tenantId ? await tenantById(tenantId) : null;
		if (byId) return byId;
		const customerId = idOf(subscription.customer);
		return customerId ? tenantByCustomer(customerId) : null;
	}

	private async activeSubscription(
		tenant: Tenant,
	): Promise<Stripe.Subscription | null> {
		const id = tenant.billing.subscriptionId;
		if (!id || tenant.billing.status === "canceled") return null;
		const subscription = await this.requireStripe().subscriptions.retrieve(id, {
			expand: ["default_payment_method"],
		});
		return subscription.status === "canceled" ||
			subscription.status === "incomplete_expired"
			? null
			: subscription;
	}

	private async requireSubscription(
		tenant: Tenant,
	): Promise<Stripe.Subscription> {
		const subscription = await this.activeSubscription(tenant);
		if (!subscription) {
			throw new BadRequestException(
				"Choose a plan first. Add-ons and billing details follow the first payment.",
			);
		}
		return subscription;
	}

	private async paymentMethod(
		tenant: Tenant,
		subscription: Stripe.Subscription,
	): Promise<PaymentMethodView | null> {
		const own = paymentMethodOf(subscription, null);
		const customerId = tenant.billing.customerId;
		if (own || !customerId) return own;
		const customer = await this.requireStripe().customers.retrieve(customerId, {
			expand: ["invoice_settings.default_payment_method"],
		});
		return customer.deleted ? null : paymentMethodOf(null, customer);
	}

	private async priceId(lookupKey: string): Promise<string> {
		const cached = this.prices.get(lookupKey);
		if (cached) return cached;
		const found = await this.requireStripe().prices.list({
			lookup_keys: [lookupKey],
			active: true,
			limit: 1,
		});
		const price = found.data[0];
		if (!price) {
			this.logger.error({ message: "Stripe price missing", lookupKey });
			throw new ServiceUnavailableException(
				"Billing is not set up on this install.",
			);
		}
		this.prices.set(lookupKey, price.id);
		return price.id;
	}

	private async portalConfigurationId(): Promise<string | null> {
		if (this.portalConfiguration !== undefined) return this.portalConfiguration;
		const configurations =
			await this.requireStripe().billingPortal.configurations.list({
				limit: 100,
			});
		const found = configurations.data.find(
			(configuration) =>
				configuration.metadata?.[BILLING.portal.metadataKey] ===
				BILLING.portal.metadataValue,
		);
		this.portalConfiguration = found?.id ?? null;
		return this.portalConfiguration;
	}

	private returnUrl(): string {
		return `${appUrl}${BILLING.return.path}`;
	}

	private limitsSummary(limits: Awaited<ReturnType<typeof planLimitsOf>>) {
		return {
			contacts: limits.contacts,
			mailboxes: limits.mailboxes,
			insightsPerMonth: limits.insightsPerMonth,
			draftsPerMonth: limits.draftsPerMonth,
			researchPerMonth: limits.researchPerMonth,
			storageGb: limits.storageGb,
			companyResearch: limits.companyResearch,
			aiIncluded: limits.aiIncluded,
		};
	}

	private async warnBelowUsage(
		tenant: Tenant,
		plan: PaidPlanId,
		addOns: AddOnQuantities,
	): Promise<void> {
		if (plan === canonicalPlanId(tenant.plan)) return;
		try {
			const usage = await runAsTenant(tenant, () => readCapacityUsage(this.db));
			const excess = planChangeExcess(plan, null, addOns, usage);
			if (excess.length === 0) return;
			this.logger.warn({
				message:
					"Plan applied below current usage. New contacts or mailboxes fail until the workspace shrinks or upgrades.",
				tenantId: tenant.id,
				plan,
				excess,
			});
		} catch (error) {
			this.logger.error(
				{
					message: "Usage check after a plan change failed",
					tenantId: tenant.id,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private addOnCatalog(): BillingOverview["addOnCatalog"] {
		return ADD_ON_IDS.map((id: AddOnId) => ({
			id,
			label: PRICING_EUR.addOns[id].label,
			monthly: PRICING_EUR.addOns[id].monthly,
		}));
	}

	private async singleTenantOverview(): Promise<BillingOverview> {
		const limits = await planLimitsOf(this.db);
		return {
			configured: false,
			hosted: false,
			plan: null,
			label: limits.label,
			interval: null,
			price: null,
			state: "none",
			trialEndsAt: null,
			paidUntil: null,
			cancelAt: null,
			graceUntil: null,
			suspended: false,
			deleteAt: null,
			deletionDays: Math.round(TENANCY.trial.suspendedTtlMs / DAY_MS),
			addOns: { ...NO_ADD_ONS },
			limits: this.limitsSummary(limits),
			addOnCatalog: this.addOnCatalog(),
			paymentMethod: null,
			address: null,
			invoices: [],
			stripeReachable: true,
		};
	}
}

function charging(
	subscription: Stripe.Subscription,
	items: ChangeItem[],
): Change {
	const change: Change = { items, proration_behavior: "always_invoice" };
	if (subscription.status === "trialing") change.trial_end = "now";
	return change;
}

function amountOf(invoice: StripeInvoice): MailAmount {
	return {
		value: invoice.amount_due / BILLING.stripe.centsPerUnit,
		currency: invoice.currency.toUpperCase(),
	};
}

function intervalOf(subscription: Stripe.Subscription): BillingInterval {
	return subscriptionState(subscription).interval ?? "month";
}

function paymentMethodView(
	method: Stripe.PaymentMethod | null,
): PaymentMethodView | null {
	if (!method) return null;
	if (method.type === "card" && method.card) {
		return {
			kind: "card",
			brand: method.card.brand,
			last4: method.card.last4,
			expires: `${String(method.card.exp_month).padStart(2, "0")}/${method.card.exp_year}`,
		};
	}
	if (method.type === "sepa_debit" && method.sepa_debit) {
		return {
			kind: "sepa_debit",
			brand: method.sepa_debit.bank_code ?? null,
			last4: method.sepa_debit.last4 ?? null,
			expires: null,
		};
	}
	return { kind: method.type, brand: null, last4: null, expires: null };
}

function addressOf(customer: Stripe.Customer): BillingOverview["address"] {
	const address = customer.address;
	const lines = address
		? [
				address.line1,
				address.line2,
				[address.postal_code, address.city].filter(Boolean).join(" "),
				address.country,
			].filter((line): line is string => Boolean(line))
		: [];
	if (!customer.name && !customer.email && lines.length === 0) return null;
	return { name: customer.name ?? null, email: customer.email ?? null, lines };
}
