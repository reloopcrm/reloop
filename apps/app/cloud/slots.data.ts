import type {
	MarketingLlms,
	MarketingNav,
	MarketingSitemap,
	SettingsNavSlot,
	SlotRedirect,
} from "@/cloud/contract";
import { MARKDOWN_LINKS } from "@/lib/markdown-negotiation";

export function landingMarkdown(): string {
	return `# Reloop CRM

An open source CRM that reads the mailbox you already have and shows which old customers are worth a call.

## Where to go next

${MARKDOWN_LINKS}
`;
}

export const BILLING_SETTINGS_NAV: readonly SettingsNavSlot[] = [];

export const BILLING_PATH: string | null = null;

export const MARKETING_ROUTES: readonly string[] = [];

export const MARKETING_REDIRECTS: readonly SlotRedirect[] = [];

export const MARKETING_NAV: MarketingNav = {
	pricing: null,
	selfHosted: null,
	reading: [],
	company: [],
};

export const MARKETING_SITEMAP: MarketingSitemap = { lead: [], rest: [] };

export const MARKETING_LLMS: MarketingLlms = { lead: [], rest: [] };
