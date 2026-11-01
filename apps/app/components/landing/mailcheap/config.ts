import type { ShotName } from "@/components/site/site-config";

export const LANDING = {
	pages: {
		home: "/",
		docs: "/docs",
		contact: "/contact",
		imprint: "/imprint",
		privacy: "/privacy",
		signIn: "/sign-in",
	},
	docs: { assistants: "ai-assistants" },
	releases: "https://github.com/reloopcrm/reloop/releases",
	hero: {
		cycle: [
			{ id: "gmail", mark: "gmail" },
			{ id: "microsoft", mark: "microsoft" },
			{ id: "imap", mark: "imap" },
		],
	},
	shots: {
		sizes: {
			hero: "(max-width: 960px) 100vw, 928px",
			split: "(max-width: 1024px) 100vw, 640px",
			tile: "(max-width: 1024px) 100vw, 360px",
			aside: "(max-width: 1024px) 100vw, 560px",
		},
		auth: { signIn: "hero-overview" },
	},
	auth: { exampleAddress: "crm.example.com" },
	brands: { github: "GitHub" },
} as const satisfies {
	pages: Record<string, string>;
	docs: Record<string, string>;
	releases: string;
	hero: {
		cycle: readonly { id: string; mark: "gmail" | "microsoft" | "imap" }[];
	};
	shots: {
		sizes: Record<string, string>;
		auth: Record<string, ShotName>;
	};
	auth: { exampleAddress: string };
	brands: Record<string, string>;
};

export type CycleMark = (typeof LANDING.hero.cycle)[number]["mark"];

export type LandingPage = keyof typeof LANDING.pages;
