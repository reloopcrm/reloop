import type { Db } from "@crm/db";
import type { TaskKind } from "@crm/db/agent-tasks";
import { SETTINGS_ID } from "@crm/db/settings";
import { z } from "zod";

export const AGENT_FUNCTION_GROUPS = [
	"reading",
	"research",
	"pictures",
	"writing",
	"rules",
] as const;

export type AgentFunctionGroup = (typeof AGENT_FUNCTION_GROUPS)[number];

export type AgentFunction = {
	id: string;
	group: AgentFunctionGroup;
	title: string;
	note: string;
	kinds: readonly TaskKind[];
};

export const WIN_BACK_FOLLOW_UP_FUNCTION = "win-back-follow-up";

export const AGENT_FUNCTIONS = [
	{
		id: "thread-insight",
		group: "reading",
		title: "Conversation summaries",
		note: "Summarises every new email conversation and records who owes a reply. The biggest model cost.",
		kinds: ["thread-insight"],
	},
	{
		id: "thread-digest",
		group: "reading",
		title: "Conversation digest",
		note: "Writes one line per message in a long conversation. One model call per request.",
		kinds: ["thread-digest"],
	},
	{
		id: "contact-research",
		group: "research",
		title: "Contact research",
		note: "Works out who a new contact is and keeps the role current. One research session per contact.",
		kinds: ["identify", "profile", "recheck"],
	},
	{
		id: "meeting-prep",
		group: "research",
		title: "Meeting preparation",
		note: "Researches the person you meet next. One research session per meeting.",
		kinds: ["meeting-prep"],
	},
	{
		id: "company-research",
		group: "research",
		title: "Company research",
		note: "Fills a new company's industry, city, links and description once, from the company's own website.",
		kinds: ["company-profile"],
	},
	{
		id: "workspace-profile",
		group: "research",
		title: "Your own company profile",
		note: "Reads your own website so the agent knows what you sell. At most once a week.",
		kinds: ["workspace-profile"],
	},
	{
		id: "field-backfill",
		group: "research",
		title: "Custom field backfill",
		note: "Fills empty custom fields on a record from evidence the agent finds. One research session per record.",
		kinds: ["field-backfill"],
	},
	{
		id: "brand",
		group: "pictures",
		title: "Company logos",
		note: "Reads the company's website for its logo, industry and city. One small model call.",
		kinds: ["brand"],
	},
	{
		id: "portrait",
		group: "pictures",
		title: "Contact photos",
		note: "Copies a photo from the GitHub account on the contact. It costs nothing.",
		kinds: ["portrait"],
	},
	{
		id: "email-draft",
		group: "writing",
		title: "Email drafts",
		note: "Writes and rewrites the email a rep asks for. One model call per draft.",
		kinds: ["email-draft"],
	},
	{
		id: "contact-clean",
		group: "writing",
		title: "Signature cleanup",
		note: "Reads the signature of a few inbound emails for name, title and phone number. One small model call per contact.",
		kinds: ["contact-clean"],
	},
	{
		id: "playbook-learn",
		group: "writing",
		title: "Learning from your sent email",
		note: "Reads your newest sent emails so drafts sound like you. One model call, rarely.",
		kinds: ["playbook-learn"],
	},
	{
		id: "deal-stall",
		group: "writing",
		title: "Next steps on stalled deals",
		note: "Once a week, writes the next step on each open deal that has gone quiet. One model call per deal.",
		kinds: ["deal-stall"],
	},
	{
		id: "rules-tune",
		group: "rules",
		title: "Win back rule tuning",
		note: "Re-tunes the win back ranking after a rep marks records good or bad. One model call per tune.",
		kinds: ["rules-tune"],
	},
	{
		id: "business-setup",
		group: "rules",
		title: "Business setup proposal",
		note: "Reads your website or your recent mail once and proposes what you trade. One model call.",
		kinds: ["business-setup"],
	},
	{
		id: WIN_BACK_FOLLOW_UP_FUNCTION,
		group: "rules",
		title: "Win back follow-up tasks",
		note: "Writes one task 14 days after a Win back outreach gets no answer. It costs nothing.",
		kinds: [],
	},
	{
		id: "usage-probe",
		group: "rules",
		title: "Subscription limit check",
		note: "Reads how much of your ChatGPT subscription limit is left. It costs almost nothing.",
		kinds: ["usage-probe"],
	},
] as const satisfies readonly AgentFunction[];

export type AgentFunctionId = (typeof AGENT_FUNCTIONS)[number]["id"];

export const agentFunctions = z.record(z.string(), z.boolean());

export type AgentFunctionSettings = z.infer<typeof agentFunctions>;

export const ALL_AGENT_FUNCTIONS_ON: AgentFunctionSettings = {};

const FUNCTION_OF_KIND = new Map<string, string>(
	AGENT_FUNCTIONS.flatMap((entry) =>
		entry.kinds.map((kind) => [kind as string, entry.id]),
	),
);

export function isAgentFunction(id: string): id is AgentFunctionId {
	return AGENT_FUNCTIONS.some((entry) => entry.id === id);
}

export function parseAgentFunctions(value: unknown): AgentFunctionSettings {
	if (value === null || value === undefined) return ALL_AGENT_FUNCTIONS_ON;

	const parsed = agentFunctions.safeParse(value);
	return parsed.success ? parsed.data : ALL_AGENT_FUNCTIONS_ON;
}

export function isAgentFunctionEnabled(
	settings: AgentFunctionSettings,
	id: string,
): boolean {
	return settings[id] !== false;
}

export function isTaskKindEnabled(
	settings: AgentFunctionSettings,
	kind: string,
): boolean {
	const id = FUNCTION_OF_KIND.get(kind);
	return id === undefined || isAgentFunctionEnabled(settings, id);
}

export async function readAgentFunctions(
	db: Db,
): Promise<AgentFunctionSettings> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { agentFunctions: true },
	});

	return parseAgentFunctions(row?.agentFunctions);
}

export async function writeAgentFunction(
	db: Db,
	id: AgentFunctionId,
	enabled: boolean,
): Promise<AgentFunctionSettings> {
	const current = await readAgentFunctions(db);
	const next = { ...current, [id]: enabled };

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, agentFunctions: next },
		update: { agentFunctions: next },
	});

	return next;
}
