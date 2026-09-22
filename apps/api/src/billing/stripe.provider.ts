import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import type { EnvironmentVariables } from "../config/env.validation";

export const STRIPE = Symbol("STRIPE");

export type StripeClient = Stripe | null;

export function stripeFrom(secretKey: string | undefined): StripeClient {
	const key = secretKey?.trim();
	return key ? new Stripe(key) : null;
}

export const stripeProvider: Provider = {
	provide: STRIPE,
	inject: [ConfigService],
	useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
		stripeFrom(config.get("STRIPE_SECRET_KEY", { infer: true })),
};
