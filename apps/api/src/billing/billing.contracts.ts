import { ADD_ON_IDS, CAPACITY_COUNTERS } from "@crm/db/plans";
import { BILLING_INTERVALS, PAID_PLAN_IDS } from "@crm/db/pricing";
import { z } from "zod";
import { BILLING } from "./billing.config";

export const BILLING_STATES = [
	"trial",
	"active",
	"canceling",
	"past_due",
	"none",
] as const;

export type BillingState = (typeof BILLING_STATES)[number];

const isoDate = z.string().nullable();

export const billingOverviewOutput = z.object({
	configured: z.boolean(),
	hosted: z.boolean(),
	plan: z.string().nullable(),
	label: z.string(),
	interval: z.enum(BILLING_INTERVALS).nullable(),
	price: z.number().nullable(),
	state: z.enum(BILLING_STATES),
	trialEndsAt: isoDate,
	paidUntil: isoDate,
	cancelAt: isoDate,
	graceUntil: isoDate,
	suspended: z.boolean(),
	deleteAt: isoDate,
	trialKeptUntil: isoDate,
	deletionDays: z.number(),
	addOns: z.record(z.enum(ADD_ON_IDS), z.number()),
	limits: z.object({
		contacts: z.number().nullable(),
		mailboxes: z.number().nullable(),
		insightsPerMonth: z.number().nullable(),
		draftsPerMonth: z.number().nullable(),
		researchPerMonth: z.number().nullable(),
		storageGb: z.number().nullable(),
		companyResearch: z.boolean(),
		aiIncluded: z.boolean(),
	}),
	addOnCatalog: z.array(
		z.object({
			id: z.enum(ADD_ON_IDS),
			label: z.string(),
			monthly: z.number(),
		}),
	),
	paymentMethod: z
		.object({
			kind: z.string(),
			brand: z.string().nullable(),
			last4: z.string().nullable(),
			expires: z.string().nullable(),
		})
		.nullable(),
	address: z
		.object({
			name: z.string().nullable(),
			email: z.string().nullable(),
			lines: z.array(z.string()),
		})
		.nullable(),
	invoices: z.array(
		z.object({
			id: z.string(),
			date: z.string(),
			amount: z.number(),
			currency: z.string(),
			status: z.string(),
			url: z.string().nullable(),
		}),
	),
	stripeReachable: z.boolean(),
});

export type BillingOverview = z.infer<typeof billingOverviewOutput>;

export const billingPlansOutput = z.object({
	plans: z.array(
		z.object({
			id: z.enum(PAID_PLAN_IDS),
			label: z.string(),
			monthly: z.number(),
			yearly: z.number(),
			aiIncluded: z.boolean(),
			contacts: z.number().nullable(),
			mailboxes: z.number().nullable(),
			storageGb: z.number().nullable(),
			over: z.array(
				z.object({
					counter: z.enum(CAPACITY_COUNTERS),
					used: z.number(),
					limit: z.number(),
				}),
			),
		}),
	),
});

export type BillingPlans = z.infer<typeof billingPlansOutput>;

export const checkoutInput = z.object({
	plan: z.enum(PAID_PLAN_IDS),
	interval: z.enum(BILLING_INTERVALS),
});

export type CheckoutInput = z.infer<typeof checkoutInput>;

export const setAddOnInput = z.object({
	addOn: z.enum(ADD_ON_IDS),
	quantity: z.number().int().min(0).max(BILLING.addOns.maxQuantity),
});

export type SetAddOnInput = z.infer<typeof setAddOnInput>;

export const PORTAL_FLOWS = ["payment_method", "billing"] as const;

export const portalInput = z.object({
	flow: z.enum(PORTAL_FLOWS),
});

export type PortalInput = z.infer<typeof portalInput>;

export const urlOutput = z.object({ url: z.string().nullable() });

export const portalOutput = z.object({ url: z.string() });

export const doneOutput = z.object({ ok: z.literal(true) });
