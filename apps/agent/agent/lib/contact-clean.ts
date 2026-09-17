import { db } from "@crm/db";
import { MEMORY } from "@crm/db/insights";
import { stripQuotedHistory } from "@crm/db/message-text";
import { streamText } from "ai";
import { z } from "zod";
import { recordFact } from "./facts";
import { directModel } from "./model";
import { looksMachineMade } from "./names";
import { UNTRUSTED_RULE, untrusted } from "./untrusted";

const CLEAN = {
	messages: 6,
	bodyTailChars: 1_200,
} as const;

const found = z.object({
	fullName: z.string().max(120).nullable(),
	title: z.string().max(120).nullable(),
	phone: z.string().max(60).nullable(),
	companyName: z.string().max(120).nullable(),
	signatureQuote: z.string().max(300).nullable(),
	foundInSignature: z.boolean(),
});

type Found = z.infer<typeof found>;

function tail(body: string | null): string {
	if (!body) return "";
	const own = stripQuotedHistory(body);
	return own.length > CLEAN.bodyTailChars
		? own.slice(-CLEAN.bodyTailChars)
		: own;
}

type Ours = { names: string[]; emails: string[]; phones: string[] };

async function ourIdentity(): Promise<Ours> {
	const [users, org] = await Promise.all([
		db.user.findMany({ select: { name: true, email: true } }),
		db.organization.findFirst({ select: { name: true } }),
	]);

	return {
		names: [...users.map((user) => user.name), org?.name ?? ""].filter(Boolean),
		emails: users.map((user) => user.email.toLowerCase()),
		phones: [],
	};
}

function properCase(name: string): string {
	return name
		.split(/(\s+|-)/)
		.map((part) =>
			part.length > 2 && part === part.toUpperCase()
				? part.charAt(0) + part.slice(1).toLocaleLowerCase("de-DE")
				: part,
		)
		.join("");
}

function sameName(a: string, b: string): boolean {
	const clean = (value: string) =>
		value.toLowerCase().replace(/[^a-zäöüß]/g, "");
	return (
		clean(a) === clean(b) ||
		clean(a).includes(clean(b)) ||
		clean(b).includes(clean(a))
	);
}

async function extract(input: {
	email: string;
	displayNames: string[];
	bodies: string[];
	ours: Ours;
}): Promise<Found> {
	const model = await directModel("reading", "contact-clean");

	const result = streamText({
		model,
		abortSignal: AbortSignal.timeout(MEMORY.callTimeoutMs),
		system: [
			"You read emails one person sent and report who they are, from their own signature block.",
			UNTRUSTED_RULE,
			"Report only what the signature or the sender line states. Never guess a name from the email address alone.",
			"fullName is the person's full name as written by them, without titles like Herr, Frau, Dr. or job titles.",
			"title is their job title, companyName the company they sign for, phone the number in the signature.",
			"foundInSignature is true only when a signature block or a name in the sender line supports fullName.",
			`The reader's own side is ${input.ours.names.join(", ")} (${input.ours.emails.join(", ")}). Quoted replies from that side are not the sender. Never report our own names, titles or phone numbers as the sender's.`,
			"signatureQuote quotes the signature lines you used, at most 300 characters.",
			"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
			JSON.stringify(z.toJSONSchema(found)),
		].join("\n"),
		prompt: [
			`Email address: ${input.email}`,
			`Sender names seen: ${input.displayNames.join(" | ") || "(none)"}`,
			...input.bodies.map(
				(body, index) =>
					`Email ${index + 1} (end of message):\n${untrusted(body)}`,
			),
		].join("\n\n"),
	});

	let text = "";
	for await (const part of result.textStream) text += part;
	const cleaned = text.replace(/```(?:json)?/gi, "").trim();
	const parsed = found.safeParse(
		JSON.parse(
			cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
		),
	);
	if (!parsed.success) throw new Error(parsed.error.message.slice(0, 200));
	return parsed.data;
}

export async function runContactClean(contactId: string): Promise<string> {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			id: true,
			email: true,
			firstName: true,
			lastName: true,
			title: true,
			phone: true,
			company: { select: { id: true, name: true, domain: true } },
		},
	});
	if (!contact?.email) return "No contact or no email address.";

	const messages = await db.emailMessage.findMany({
		where: { fromEmail: contact.email, direction: "INBOUND" },
		orderBy: { sentAt: "desc" },
		take: CLEAN.messages,
		select: { fromName: true, body: true, snippet: true },
	});

	const done = async (outcome: string) => {
		await db.contact.update({
			where: { id: contactId },
			data: { cleanedAt: new Date() },
		});
		return outcome;
	};

	if (messages.length === 0) return done("No email from them to read.");

	const ours = await ourIdentity();
	const facts = await extract({
		email: contact.email,
		displayNames: [
			...new Set(
				messages.map((m) => m.fromName).filter((n): n is string => Boolean(n)),
			),
		],
		bodies: messages.map((m) => tail(m.body ?? m.snippet)),
		ours,
	});

	if (
		facts.fullName &&
		ours.names.some((name) => sameName(name, facts.fullName ?? ""))
	) {
		return done("The only signature found was our own; nothing changed.");
	}

	const changes: string[] = [];

	if (facts.fullName) facts.fullName = properCase(facts.fullName);

	const evidence = [
		{
			kind: "crm.signature-block" as const,
			detail:
				facts.signatureQuote ?? `Signed as ${facts.fullName ?? contact.email}`,
		},
		{
			kind: "crm.thread-reply" as const,
			detail: `Sent from ${contact.email}`,
		},
	];

	if (facts.fullName && facts.foundInSignature) {
		const derived = looksMachineMade(
			contact.email,
			contact.firstName,
			contact.lastName,
		);
		const nameResult = await recordFact({
			contactId,
			field: "name",
			value: facts.fullName,
			evidence,
			method: "contact-clean",
		});
		if (nameResult.applied) changes.push(`name → ${facts.fullName}`);
		else if (derived) changes.push(`name proposed: ${facts.fullName}`);

		if (facts.title && !contact.title) {
			const titleResult = await recordFact({
				contactId,
				field: "title",
				value: facts.title,
				evidence,
				method: "contact-clean",
			});
			if (titleResult.applied) changes.push(`title → ${facts.title}`);
		}
	}

	if (facts.phone && !contact.phone) {
		const phoneResult = await recordFact({
			contactId,
			field: "phone",
			value: facts.phone,
			evidence,
			method: "contact-clean",
		});
		if (phoneResult.applied) changes.push(`phone → ${facts.phone}`);
		else if (phoneResult.stored) changes.push(`phone proposed: ${facts.phone}`);
	}

	if (
		facts.companyName &&
		contact.company &&
		contact.company.name === contact.company.domain
	) {
		await db.company.update({
			where: { id: contact.company.id },
			data: { name: facts.companyName },
		});
		changes.push(`company → ${facts.companyName}`);
	}

	return done(
		changes.length
			? `Cleaned: ${changes.join(", ")}.`
			: "Signature confirmed what the record already had.",
	);
}
