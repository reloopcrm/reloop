import type { Locale } from "@crm/db/locale";
import { BILLING_SEAM } from "../billing-port/billing-port";

const SECOND = 1;
const MINUTE = 60 * SECOND;

const STRIPE_LOCALES = {
	en: "en",
	de: "de",
	es: "es",
	fr: "fr",
	"pt-BR": "pt-BR",
	tr: "tr",
	"zh-Hans": "zh",
} as const satisfies Record<Locale, string>;

export const BILLING = {
	webhook: {
		...BILLING_SEAM.webhook,
		toleranceSeconds: 5 * MINUTE,
		events: [
			"checkout.session.completed",
			"customer.subscription.created",
			"customer.subscription.updated",
			"customer.subscription.deleted",
			"invoice.paid",
			"invoice.payment_failed",
		],
	},
	return: {
		...BILLING_SEAM.return,
		checkoutParam: "checkout",
		outcome: { success: "success", cancel: "cancel" },
	},
	invoices: { limit: 24 },
	portal: { metadataKey: "reloop", metadataValue: "portal" },
	addOns: { maxQuantity: 99 },
	schedule: {
		nextPhaseIntervals: 1,
		endBehavior: "release",
		...BILLING_SEAM.schedule,
	},
	stripe: {
		locales: STRIPE_LOCALES,
		centsPerUnit: 100,
		missingCode: "resource_missing",
	},
} as const;
