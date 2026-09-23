const SECOND = 1;
const MINUTE = 60 * SECOND;

export const BILLING = {
	webhook: {
		path: "/api/billing/webhook",
		maxBytes: 1_000_000,
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
	return: { path: "/settings/billing", checkoutParam: "checkout" },
	invoices: { limit: 24 },
	portal: { metadataKey: "reloop", metadataValue: "portal" },
	addOns: { maxQuantity: 99 },
} as const;
