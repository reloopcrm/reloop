import { PRICING } from "@/components/landing/pricing/config";

const SIGN_IN_PATH = "/sign-in";

function address(name: "RELOOP_CLOUD_URL" | "RELOOP_SITE_URL") {
	const value = process.env[name]?.trim().replace(/\/+$/, "");
	return value || undefined;
}

export function cloudUrl(): string | undefined {
	return address("RELOOP_CLOUD_URL");
}

export function siteUrl(): string | undefined {
	return address("RELOOP_SITE_URL");
}

export function signUpUrl(plan?: string): string {
	const path = `${cloudUrl() ?? ""}${PRICING.href.start}`;
	return plan ? `${path}?${PRICING.href.planParam}=${plan}` : path;
}

export function signInUrl(): string {
	return `${cloudUrl() ?? ""}${SIGN_IN_PATH}`;
}

export function marketingUrl(path: string): string {
	return `${siteUrl() ?? ""}${path}`;
}
