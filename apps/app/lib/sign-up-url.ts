import { PRICING } from "@/components/landing/pricing/config";

export function cloudUrl(): string | undefined {
	const value = process.env.RELOOP_CLOUD_URL?.trim().replace(/\/+$/, "");
	return value || undefined;
}

export function signUpUrl(plan?: string): string {
	const path = `${cloudUrl() ?? ""}${PRICING.href.start}`;
	return plan ? `${path}?${PRICING.href.planParam}=${plan}` : path;
}
