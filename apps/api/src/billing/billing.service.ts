import { appUrl, isWorkspaceAdmin, workspaceRoleOf } from "@crm/auth";
import type { Db } from "@crm/db";
import { planLimitsOf } from "@crm/db/plan-usage";
import {
	ADD_ON_IDS,
	type AddOnId,
	type AddOnQuantities,
	canonicalPlanId,
	NO_ADD_ONS,
	PLANS,
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
import { currentTenant, isHosted, runAsTenant } from "@crm/db/tenant-context";
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
import { BILLING } from "./billing.config";
import type {
	BillingOverview,
	BillingState,
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

export function checkoutTrialEnd(
	tenant: Pick<Tenant, "plan" | "status" | "trialEndsAt" | "billing">,
	now: Date = new Date(),
): Date | null {
	if (tenant.status !== "active") return null;
	if (canonicalPlanId(tenant.plan) !== "trial") return null;
	if (
		tenant.billing.status === "active" ||
		tenant.billing.status === "past_due"
	)
		return null;
	const trialEndsAt = tenant.trialEndsAt;
	if (!trialEndsAt) return null;
	return trialEndsAt.getTime() - now.getTime() > BILLING.checkout.trialLeadMs
		? trialEndsAt
		: null;
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
		if (tenant.status === "suspended" && state.status === "active") {
			await setTenantStatus(tenant.id, "active");
		}
		forgetTenant(tenant.id);
	}

	async overview(userId: string): Promise<BillingOverview> {
		await this.assertManager(userId);
		if (!isHosted()) return this.singleTenantOverview();

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
			trialKeptUntil: checkoutTrialEnd(tenant)?.toISOString() ?? null,
			deletionDays: Math.round(TENANCY.trial.suspendedTtlMs / DAY_MS),
			addOns: tenant.billing.addOns,
			limits: this.limitsSummary(limits),
			plans: this.planCatalog(),
			addOnCatalog: this.addOnCatalog(),
			paymentMethod: null,
			address: null,
			invoices: [],
			stripeReachable: true,
		};

		const customerId = tenant.billing.customerId;
		if (!this.stripe || !customerId) return overview;

		try {
			const [customer, invoices] = await Promise.all([
				this.stripe.customers.retrieve(customerId, {
					expand: ["invoice_settings.default_payment_method"],
				}),
				this.stripe.invoices.list({
					customer: customerId,
					limit: BILLING.invoices.limit,
				}),
			]);
			if (!customer.deleted) {
				overview.paymentMethod = paymentMethodOf(customer);
				overview.address = addressOf(customer);
			}
			overview.invoices = invoices.data.map((invoice) => ({
				id: invoice.id,
				date: new Date(invoice.created * 1000).toISOString(),
				amount: invoice.total / 100,
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

	async checkout(
		userId: string,
		input: CheckoutInput,
	): Promise<{ url: string | null }> {
		await this.assertManager(userId);
		const stripe = this.requireStripe();
		const tenant = await this.freshTenant();
		const price = await this.priceId(planLookupKey(input.plan, input.interval));
		const subscription = await this.activeSubscription(tenant);

		if (subscription) {
			const base = subscription.items.data.find(
				(item) => parseLookupKey(item.price.lookup_key)?.kind === "plan",
			);
			if (!base)
				throw new BadRequestException(
					"Your subscription has no plan item. Contact support.",
				);
			if (input.interval === "year" && !(await this.hasCard(tenant))) {
				throw new BadRequestException(
					"A yearly plan is paid by card. Add a card under Payment first.",
				);
			}
			const items: Stripe.SubscriptionUpdateParams.Item[] = [
				{ id: base.id, price },
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
			const updated = await stripe.subscriptions.update(subscription.id, {
				items,
				proration_behavior: "always_invoice",
				cancel_at_period_end: false,
			});
			await this.applySubscription(tenant, updated);
			return { url: null };
		}

		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: { email: true },
		});
		const customerId = tenant.billing.customerId;
		const trialEnd = checkoutTrialEnd(tenant);
		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			line_items: [{ price, quantity: 1 }],
			customer: customerId ?? undefined,
			customer_email: customerId ? undefined : user?.email,
			customer_update: customerId
				? { address: "auto", name: "auto" }
				: undefined,
			client_reference_id: tenant.id,
			metadata: { tenantId: tenant.id },
			subscription_data: {
				metadata: { tenantId: tenant.id },
				trial_end: trialEnd ? Math.floor(trialEnd.getTime() / 1000) : undefined,
			},
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

	async setAddOn(userId: string, input: SetAddOnInput): Promise<{ ok: true }> {
		await this.assertManager(userId);
		const stripe = this.requireStripe();
		const tenant = await this.freshTenant();
		const subscription = await this.activeSubscription(tenant);
		if (!subscription) {
			throw new BadRequestException(
				"Choose a plan first. Add-ons and billing details follow the first payment.",
			);
		}

		const price = await this.priceId(
			addOnLookupKey(input.addOn, intervalOf(subscription)),
		);
		const existing = subscription.items.data.find(
			(item) => item.price.id === price,
		);
		const item: Stripe.SubscriptionUpdateParams.Item = existing
			? input.quantity === 0
				? { id: existing.id, deleted: true }
				: { id: existing.id, quantity: input.quantity }
			: { price, quantity: input.quantity };
		if (!existing && input.quantity === 0) return { ok: true };

		const updated = await stripe.subscriptions.update(subscription.id, {
			items: [item],
			proration_behavior: "always_invoice",
		});
		await this.applySubscription(tenant, updated);
		return { ok: true };
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
		const subscription = await this.activeSubscription(tenant);
		if (!subscription) {
			throw new BadRequestException(
				"Choose a plan first. Add-ons and billing details follow the first payment.",
			);
		}

		const updated = await stripe.subscriptions.update(subscription.id, {
			cancel_at_period_end: cancel,
		});
		await this.applySubscription(tenant, updated);
		return { ok: true };
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
		if (!isHosted()) {
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
		const subscription = await this.requireStripe().subscriptions.retrieve(id);
		return subscription.status === "canceled" ||
			subscription.status === "incomplete_expired"
			? null
			: subscription;
	}

	private async hasCard(tenant: Tenant): Promise<boolean> {
		const customerId = tenant.billing.customerId;
		if (!customerId) return false;
		const customer = await this.requireStripe().customers.retrieve(customerId, {
			expand: ["invoice_settings.default_payment_method"],
		});
		return !customer.deleted && paymentMethodOf(customer)?.kind === "card";
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
			aiIncluded: limits.aiIncluded,
		};
	}

	private planCatalog(): BillingOverview["plans"] {
		return PAID_PLAN_IDS.map((id) => ({
			id,
			label: PLANS[id].label,
			monthly: PRICING_EUR.plans[id].monthly,
			yearly: PRICING_EUR.plans[id].yearly,
			aiIncluded: PLANS[id].aiIncluded,
		}));
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
			trialKeptUntil: null,
			deletionDays: Math.round(TENANCY.trial.suspendedTtlMs / DAY_MS),
			addOns: { ...NO_ADD_ONS },
			limits: this.limitsSummary(limits),
			plans: this.planCatalog(),
			addOnCatalog: this.addOnCatalog(),
			paymentMethod: null,
			address: null,
			invoices: [],
			stripeReachable: true,
		};
	}
}

function intervalOf(subscription: Stripe.Subscription): BillingInterval {
	return subscriptionState(subscription).interval ?? "month";
}

function paymentMethodOf(
	customer: Stripe.Customer,
): BillingOverview["paymentMethod"] {
	const method = expanded(customer.invoice_settings?.default_payment_method);
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
