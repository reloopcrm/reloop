import { DAY_MS, SECOND_MS } from "./dispatch-config";

export const RESEARCH = {
	budget: {
		defaultUnits: 4,
		maxUnits: 20,
	},

	cost: {
		webQuestion: 1,
		deepWebQuestion: 2,
		socialSearch: 1,
		socialCheck: 1,
		siteBrief: 1,
	},

	perplexity: {
		endpoint: "https://api.perplexity.ai/chat/completions",
		timeoutMs: 45 * SECOND_MS,
	},

	socials: {
		github: {
			endpoint: "https://api.github.com/users/",
			timeoutMs: 15 * SECOND_MS,
			userAgent: "reloop-crm-research-agent",
		},
		domains: {
			x: ["x.com", "twitter.com"],
			github: ["github.com"],
		},
		hosts: {
			x: [
				"x.com",
				"www.x.com",
				"twitter.com",
				"www.twitter.com",
				"mobile.twitter.com",
			],
			github: ["github.com", "www.github.com"],
		},
		reserved: {
			x: [
				"i",
				"home",
				"explore",
				"search",
				"settings",
				"notifications",
				"messages",
				"intent",
				"share",
				"hashtag",
				"status",
				"login",
				"signup",
				"about",
				"privacy",
				"tos",
				"compose",
			],
			github: [
				"orgs",
				"organizations",
				"features",
				"about",
				"pricing",
				"topics",
				"collections",
				"sponsors",
				"marketplace",
				"settings",
				"login",
				"join",
				"signup",
				"enterprise",
				"apps",
				"explore",
				"trending",
				"security",
				"readme",
				"site",
				"contact",
				"search",
				"new",
				"notifications",
			],
		},
	},

	recheck: {
		dayMs: DAY_MS,
		minDays: 1,
		maxDays: 730,
	},

	brief: {
		narrativeMinChars: 40,
		narrativeMaxChars: 400,
	},

	lookup: {
		dayMs: DAY_MS,
		deals: { defaultLimit: 50, maxLimit: 100 },
		search: { defaultLimit: 10 },
	},
} as const;
