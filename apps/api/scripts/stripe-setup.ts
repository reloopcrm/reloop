import "@crm/env/load";
import { ADD_ON_IDS, PLANS } from "@crm/db/plans";
import {
	addOnLookupKey,
	BILLING_INTERVALS,
	type BillingInterval,
	PAID_PLAN_IDS,
	PRICING_EUR,
	planLookupKey,
	yearlyTotal,
} from "@crm/db/pricing";
import Stripe from "stripe";
import { BILLING } from "../src/billing/billing.config";

export const USAGE = [
	"Usage: bun scripts/stripe-setup.ts [--webhook <url>]",
	"",
	"Creates the products, prices, customer portal and webhook endpoint that",
	"Settings > Plan & billing needs, from packages/db/src/pricing.ts. Runs",
	"again without harm: a price that exists is kept.",
	"",
	"  --webhook <url>   register <url> for the billing events and print the",
	"                    signing secret once (STRIPE_WEBHOOK_SECRET)",
	"",
	"Needs STRIPE_SECRET_KEY. Use a test mode key first.",
].join("\n");

export const STRIPE_CATALOG = {
	taxCode: "txcd_10103001",
	productPrefix: "Reloop CRM",
	metadata: { key: "reloop" },
	portal: { metadata: "portal" },
} as const;

type Catalog = {
	products: { name: string; metadata: Record<string, string> }[];
	prices: {
		lookupKey: string;
		product: string;
		interval: BillingInterval;
		amountCents: number;
	}[];
};

export function catalog(): Catalog {
	const products: Catalog["products"] = [];
	const prices: Catalog["prices"] = [];

	for (const plan of PAID_PLAN_IDS) {
		const name = `${STRIPE_CATALOG.productPrefix} ${PLANS[plan].label}`;
		products.push({
			name,
			metadata: { [STRIPE_CATALOG.metadata.key]: "plan", plan },
		});
		const price = PRICING_EUR.plans[plan];
		for (const interval of BILLING_INTERVALS) {
			prices.push({
				lookupKey: planLookupKey(plan, interval),
				product: name,
				interval,
				amountCents:
					(interval === "year" ? yearlyTotal(price) : price.monthly) * 100,
			});
		}
	}

	for (const addOn of ADD_ON_IDS) {
		const name = `${STRIPE_CATALOG.productPrefix} add-on: ${PRICING_EUR.addOns[addOn].label}`;
		products.push({
			name,
			metadata: { [STRIPE_CATALOG.metadata.key]: "addon", addOn },
		});
		const monthly = PRICING_EUR.addOns[addOn].monthly;
		for (const interval of BILLING_INTERVALS) {
			prices.push({
				lookupKey: addOnLookupKey(addOn, interval),
				product: name,
				interval,
				amountCents: (interval === "year" ? monthly * 12 : monthly) * 100,
			});
		}
	}

	return { products, prices };
}

export function parseArgs(argv: readonly string[]) {
	const at = argv.indexOf("--webhook");
	const webhook = at >= 0 ? (argv[at + 1] ?? null) : null;
	if (at >= 0 && !webhook) throw new Error(USAGE);
	return { webhook };
}

async function ensureProducts(
	stripe: Stripe,
	wanted: Catalog["products"],
): Promise<Map<string, string>> {
	const ids = new Map<string, string>();
	const existing = await stripe.products
		.list({ active: true, limit: 100 })
		.autoPagingToArray({ limit: 1000 });
	for (const product of wanted) {
		const found = existing.find(
			(candidate) =>
				candidate.metadata[STRIPE_CATALOG.metadata.key] ===
					product.metadata[STRIPE_CATALOG.metadata.key] &&
				candidate.metadata.plan === product.metadata.plan &&
				candidate.metadata.addOn === product.metadata.addOn,
		);
		if (found) {
			ids.set(product.name, found.id);
			console.log(`product kept     ${product.name}`);
			continue;
		}
		const created = await stripe.products.create({
			name: product.name,
			metadata: product.metadata,
			tax_code: STRIPE_CATALOG.taxCode,
		});
		ids.set(product.name, created.id);
		console.log(`product created  ${product.name}`);
	}
	return ids;
}

async function ensurePrices(
	stripe: Stripe,
	wanted: Catalog["prices"],
	products: Map<string, string>,
): Promise<void> {
	const existing = await stripe.prices
		.list({
			active: true,
			lookup_keys: wanted.map((price) => price.lookupKey),
			limit: 100,
		})
		.autoPagingToArray({ limit: 1000 });
	for (const price of wanted) {
		if (
			existing.some((candidate) => candidate.lookup_key === price.lookupKey)
		) {
			console.log(`price kept       ${price.lookupKey}`);
			continue;
		}
		const product = products.get(price.product);
		if (!product) throw new Error(`No product for ${price.lookupKey}`);
		await stripe.prices.create({
			product,
			lookup_key: price.lookupKey,
			currency: PRICING_EUR.currency,
			unit_amount: price.amountCents,
			recurring: { interval: price.interval },
			tax_behavior: "exclusive",
		});
		console.log(
			`price created    ${price.lookupKey}  ${(price.amountCents / 100).toFixed(2)} EUR / ${price.interval}`,
		);
	}
}

export async function ensurePortal(stripe: Stripe): Promise<string> {
	const configurations = await stripe.billingPortal.configurations.list({
		limit: 100,
	});
	const found = configurations.data.find(
		(configuration) =>
			configuration.metadata?.[STRIPE_CATALOG.metadata.key] ===
			STRIPE_CATALOG.portal.metadata,
	);
	if (found) {
		console.log(`portal kept      ${found.id}`);
		return found.id;
	}
	const created = await stripe.billingPortal.configurations.create({
		metadata: { [STRIPE_CATALOG.metadata.key]: STRIPE_CATALOG.portal.metadata },
		features: {
			invoice_history: { enabled: true },
			payment_method_update: { enabled: true },
			customer_update: {
				enabled: true,
				allowed_updates: ["name", "email", "address", "tax_id"],
			},
			subscription_cancel: { enabled: false },
			subscription_update: { enabled: false },
		},
		business_profile: { headline: `${STRIPE_CATALOG.productPrefix}` },
	});
	console.log(`portal created   ${created.id}`);
	return created.id;
}

async function ensureWebhook(stripe: Stripe, url: string): Promise<void> {
	const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
	const found = endpoints.data.find((endpoint) => endpoint.url === url);
	if (found) {
		console.log(
			`webhook kept     ${url}\n  Stripe shows the signing secret only once. Roll it in the Dashboard to get a new one.`,
		);
		return;
	}
	const created = await stripe.webhookEndpoints.create({
		url,
		enabled_events: [...BILLING.webhook.events],
		description: `${STRIPE_CATALOG.productPrefix} billing`,
	});
	console.log(
		`webhook created  ${url}\n  STRIPE_WEBHOOK_SECRET="${created.secret ?? ""}"\n  Put it in the root .env now. Stripe never shows it again.`,
	);
}

export async function main(argv: readonly string[]): Promise<void> {
	const { webhook } = parseArgs(argv);
	const key = process.env.STRIPE_SECRET_KEY?.trim();
	if (!key) throw new Error(`STRIPE_SECRET_KEY is not set.\n\n${USAGE}`);
	const stripe = new Stripe(key);
	const mode = key.startsWith("sk_live_") ? "LIVE" : "test";
	console.log(`Stripe ${mode} mode`);

	const wanted = catalog();
	const products = await ensureProducts(stripe, wanted.products);
	await ensurePrices(stripe, wanted.prices, products);
	await ensurePortal(stripe);
	if (webhook) await ensureWebhook(stripe, webhook);

	console.log(
		[
			"",
			"Done. Left to do in the Stripe Dashboard, by hand:",
			"  1. Activate Stripe Tax: origin address and the tax registrations.",
			"  2. Turn on the payment methods you want for monthly plans (card, SEPA).",
			webhook
				? ""
				: `  3. Run again with --webhook https://<your app>${BILLING.webhook.path}`,
		]
			.filter(Boolean)
			.join("\n"),
	);
}

if (import.meta.main) {
	await main(process.argv.slice(2)).catch((error: Error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
