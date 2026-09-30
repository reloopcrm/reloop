import { db, EnrichmentStatus } from "@crm/db";
import { REP_ASKED_REASON } from "@crm/db/agent-tasks";
import { TYPESAFE } from "@crm/db/typesafe";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { COPY } from "./copy";
import { DISPATCH } from "./dispatch-config";
import { markRunning, settle } from "./enrichment";
import {
	askNoul,
	type JevFields,
	type JevNoulAsk,
	type JevQuestion,
	typesafeKey,
} from "./jev";
import { countGate, countGateFailure } from "./jev-meter";
import { say } from "./language";
import { isDerivedName } from "./names";
import type { LeasedTask } from "./tasks";

export const IDENTIFY_KIND = "identify";

const PRECHECK = DISPATCH.research.precheck;
const JEV_GATE = "identify-precheck";
const FILLED_GATE = "identify-filled";
const GATE_WORD = "skipped";

export type PrecheckVerdict = "run" | "filled" | "unlikely";

export type PrecheckDeps = {
	ask?: JevNoulAsk;
	business?: () => Promise<string>;
};

async function workspaceBusiness(): Promise<string> {
	return (await readWinBackRules(db)).business.description;
}

type PrecheckContact = NonNullable<Awaited<ReturnType<typeof readContact>>>;

function readContact(contactId: string) {
	return db.contact.findUnique({
		where: { id: contactId },
		select: {
			firstName: true,
			lastName: true,
			email: true,
			title: true,
			linkedinUrl: true,
			lastActivityAt: true,
			company: { select: { name: true } },
			_count: { select: { deals: true, emailThreads: true } },
		},
	});
}

function isFilled(contact: PrecheckContact): boolean {
	return Boolean(
		!isDerivedName(contact.email, contact.firstName, contact.lastName) &&
			contact.title?.trim() &&
			contact.company?.name.trim() &&
			contact.linkedinUrl?.trim(),
	);
}

function precheckQuestion(): JevQuestion {
	return {
		type: "noul",
		instructions:
			"The state holds the workspace's own business and one contact in its sales win-back CRM: the person's name, their email domain, their company and how much they have exchanged with the workspace. Is a web research session on this person worth it?",
		criteria: {
			true: "The contact looks like a real person the business could sell to or win back: a buyer, decision maker, customer, supplier or partner at a company, with real mail in both directions or a deal.",
			false:
				"A research session is wasted on this contact: a shared or automated mailbox, a newsletter or tool sender, a private or personal contact, a job applicant, a vendor pitching the workspace, or someone with no link to what the business trades in.",
		},
	};
}

async function relationship(
	contactId: string,
	contact: PrecheckContact,
): Promise<string> {
	const counts = await db.emailMessage.groupBy({
		by: ["direction"],
		where: { thread: { contactId } },
		_count: true,
	});
	const sent = (direction: string) =>
		counts.find((row) => row.direction === direction)?._count ?? 0;
	const last = contact.lastActivityAt
		? contact.lastActivityAt.toISOString().slice(0, 10)
		: "never";

	return `${contact._count.emailThreads} email conversations, ${sent("INBOUND")} messages from them, ${sent("OUTBOUND")} messages to them, ${contact._count.deals} deals. Last contact: ${last}.`;
}

async function precheckState(
	contactId: string,
	contact: PrecheckContact,
	business: string,
): Promise<JevFields> {
	const derived = isDerivedName(
		contact.email,
		contact.firstName,
		contact.lastName,
	);

	return {
		business: business.slice(0, TYPESAFE.gate.businessMaxChars),
		name: derived
			? "No real name yet, only the address."
			: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
		emailDomain: contact.email?.split("@")[1] ?? "none",
		company: contact.company?.name ?? "none",
		relationship: await relationship(contactId, contact),
	};
}

async function worthResearch(
	contactId: string,
	contact: PrecheckContact,
	{ ask = askNoul, business: readBusiness = workspaceBusiness }: PrecheckDeps,
): Promise<boolean> {
	const key = await typesafeKey();
	if (!key) return true;

	const business = (await readBusiness()).trim();
	if (!business) return true;

	const noul = await ask(
		key,
		await precheckState(contactId, contact, business),
		PRECHECK.question,
		precheckQuestion(),
	).catch(() => null);

	if (noul === null) {
		countGateFailure(JEV_GATE, GATE_WORD);
		return true;
	}

	const skip = noul < PRECHECK.threshold;
	countGate(JEV_GATE, skip, GATE_WORD);

	return !skip;
}

export async function identifyPrecheck(
	task: LeasedTask,
	deps: PrecheckDeps = {},
): Promise<PrecheckVerdict> {
	if (task.kind !== IDENTIFY_KIND || !task.contactId) return "run";
	if (task.reason.startsWith(REP_ASKED_REASON)) return "run";

	const contact = await readContact(task.contactId);
	if (!contact) return "run";

	const filled = isFilled(contact);
	countGate(FILLED_GATE, filled, GATE_WORD);
	if (filled) return "filled";

	return (await worthResearch(task.contactId, contact, deps))
		? "run"
		: "unlikely";
}

export async function finishSkipped(
	task: LeasedTask,
	verdict: Exclude<PrecheckVerdict, "run">,
): Promise<void> {
	const outcome = say(COPY.precheck[verdict]);

	await markRunning(task);
	if (verdict === "filled") await settle(task, EnrichmentStatus.COMPLETE);
	else await settle(task, EnrichmentStatus.SKIPPED, outcome);

	await db.agentTask.updateMany({
		where: { id: task.id, finishedAt: null },
		data: {
			finishedAt: new Date(),
			outcome: outcome.slice(0, 500),
			startedAt: null,
			attempts: { decrement: 1 },
		},
	});
}

export async function skippedByPrecheck(
	task: LeasedTask,
	deps: PrecheckDeps = {},
): Promise<boolean> {
	try {
		const verdict = await identifyPrecheck(task, deps);
		if (verdict === "run") return false;

		await finishSkipped(task, verdict);
		return true;
	} catch (error) {
		console.error(
			`[agent] the identify pre-check failed, so the research runs: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return false;
	}
}
