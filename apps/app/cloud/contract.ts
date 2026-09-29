export type SlotLink = { path: string; label: string };

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
