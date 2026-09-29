export const PROXY = {
	path: {
		landing: "/",
		signIn: "/sign-in",
		notFound: "/_not-found",
	},
	anonymous: [
		"/t",
		"/docs",
		"/opengraph-image",
		"/twitter-image",
		"/robots.txt",
		"/sitemap.xml",
		"/llms.txt",
	],
	marketing: ["/contact", "/privacy", "/imprint", "/get-started"],
	hosted: ["/get-started"],
	cloudOnly: ["/sign-in", "/get-started"],
	ungated: ["/grant-access", "/eve", "/paused"],
	sections: ["/companies", "/contacts", "/deals", "/win-back", "/settings"],
	workspaceSegments: ["agents", "chat"],
	redirectStatus: { permanent: 308, temporary: 307 },
} as const;
