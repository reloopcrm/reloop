const FILES = {
	selfHost: ["docs", "self-host.md"],
	environment: ["docs", "environment.md"],
	restApi: ["docs", "rest-api.md"],
} as const;

export type DocFile = keyof typeof FILES;

export type DocPage = {
	slug: string;
	title: string;
	description: string;
	file: DocFile;
	from: string;
	to?: string;
};

const PAGES: readonly DocPage[] = [
	{
		slug: "requirements",
		title: "Requirements",
		description:
			"The server, memory, disk space and ports a self-hosted Reloop CRM needs.",
		file: "selfHost",
		from: "requirements",
		to: "install",
	},
	{
		slug: "install",
		title: "Install",
		description:
			"Install Reloop CRM with one command, what the installer asks, and how to answer without questions.",
		file: "selfHost",
		from: "install",
		to: "what-runs",
	},
	{
		slug: "what-runs",
		title: "What runs",
		description:
			"The services and images a Reloop CRM install starts with Docker Compose.",
		file: "selfHost",
		from: "what-runs",
		to: "use-an-existing-reverse-proxy",
	},
	{
		slug: "reverse-proxy",
		title: "Use an existing reverse proxy",
		description:
			"Run Reloop CRM behind your own reverse proxy instead of the bundled Caddy.",
		file: "selfHost",
		from: "use-an-existing-reverse-proxy",
		to: "connect-a-mailbox",
	},
	{
		slug: "mailboxes",
		title: "Connect a mailbox",
		description:
			"Connect IMAP, Google or Microsoft mailboxes to a self-hosted Reloop CRM.",
		file: "selfHost",
		from: "connect-a-mailbox",
		to: "set-up-ai",
	},
	{
		slug: "ai",
		title: "Set up AI",
		description:
			"Give the Reloop CRM agent a model through OpenRouter, your own API key or a ChatGPT subscription.",
		file: "selfHost",
		from: "set-up-ai",
		to: "update",
	},
	{
		slug: "update",
		title: "Update",
		description:
			"Update a self-hosted Reloop CRM to the newest release or pin one version.",
		file: "selfHost",
		from: "update",
		to: "back-up",
	},
	{
		slug: "backup",
		title: "Back up",
		description:
			"Back up the Reloop CRM database and the .env file with a nightly dump.",
		file: "selfHost",
		from: "back-up",
		to: "uninstall",
	},
	{
		slug: "uninstall",
		title: "Uninstall",
		description:
			"Stop Reloop CRM, keep or delete its data, and remove the install folder.",
		file: "selfHost",
		from: "uninstall",
	},
	{
		slug: "rest-api",
		title: "REST API",
		description:
			"Call every CRM procedure over REST, where the base address is, and how to make a key.",
		file: "restApi",
		from: "rest-api",
	},
	{
		slug: "environment",
		title: "Environment variables",
		description:
			"Every environment variable Reloop CRM reads, which ones are required, and what each optional one adds.",
		file: "environment",
		from: "environment",
	},
];

export const DOCS = {
	path: "/docs",
	root: ["..", ".."],
	files: FILES,
	cache: { life: "max" },
	pages: PAGES,
	index: {
		title: "Docs",
		description: "How to install, update and back up a self-hosted Reloop CRM.",
		lede: {
			file: "selfHost",
			from: "self-host-reloop-crm",
			to: "requirements",
		},
	},
} as const;

export function docPath(slug: string): string {
	return `${DOCS.path}/${slug}`;
}
