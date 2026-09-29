import type { PlanPurchase } from "@crm/db/pricing";
import type { Button } from "@crm/ui/components/button";
import type { ComponentProps, ReactNode } from "react";

export type SlotLink = { path: string; label: string };

export type SlotRedirect = {
	source: string;
	destination: string;
	permanent: boolean;
};

export type LlmsEntry = { title: string; path: string; note: string };

export type SettingsNavSlot = {
	title: string;
	href: string;
	hosted: boolean;
	admin: boolean;
	group: "plan";
};

export type MarketingNav = {
	pricing: SlotLink | null;
	selfHosted: SlotLink | null;
	reading: readonly SlotLink[];
	company: readonly SlotLink[];
};

export type MarketingSitemap = {
	lead: readonly string[];
	rest: readonly string[];
};

export type MarketingLlms = {
	lead: readonly LlmsEntry[];
	rest: readonly LlmsEntry[];
};

export type CheckoutNotice =
	| { kind: "confirming" }
	| { kind: "resume"; wanted: PlanPurchase }
	| null;

export type CheckoutNoticeInput = {
	outcome: string | string[] | undefined;
	wanted: PlanPurchase | null;
	admin: boolean;
};

export type CheckoutBannerProps = { wanted: PlanPurchase; label: string };

export type CheckoutButtonProps = {
	purchase: PlanPurchase;
	variant?: ComponentProps<typeof Button>["variant"];
	title?: string;
	children: ReactNode;
};

export type CheckoutUrl = (
	wanted: PlanPurchase,
	fallback: string,
) => Promise<string>;

export type PausedPaymentSectionProps = { admin: boolean };
