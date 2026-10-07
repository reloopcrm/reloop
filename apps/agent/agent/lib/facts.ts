import { db, FactBand, FactStatus, type Prisma, RecordSource } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { type Evidence, scoreEvidence, selfAssertedOnly } from "./evidence";
import { currentFocus } from "./focus";
import { isDerivedName, shortensName, splitName } from "./names";

const FIELDS = {
	name: { column: null },
	title: { column: "title" },
	phone: { column: "phone" },
	linkedinUrl: { column: "linkedinUrl" },
	twitterUrl: { column: "twitterUrl" },
	githubUrl: { column: "githubUrl" },
	employer: { column: null },
	seniority: { column: "seniority" },
	function: { column: "function" },
	location: { column: null },
	tenure: { column: null },
} as const;

export type FactField = keyof typeof FIELDS;

export type FactColumn = NonNullable<(typeof FIELDS)[FactField]["column"]>;

export const FACT_FIELDS = Object.keys(FIELDS) as FactField[];

export const FACT_SUBJECT_SELECT = {
	email: true,
	firstName: true,
	lastName: true,
	source: true,
	title: true,
	phone: true,
	seniority: true,
	function: true,
	linkedinUrl: true,
	twitterUrl: true,
	githubUrl: true,
} as const satisfies Prisma.ContactSelect;

export type FactSubject = {
	email: string | null;
	firstName: string;
	lastName: string | null;
	source: RecordSource;
} & { [Column in FactColumn]: string | null };

export function factColumn(field: FactField): FactColumn | null {
	return FIELDS[field].column;
}

export function fillsBlank(input: {
	field: FactField;
	contact: FactSubject;
	agentValue: string | null;
}): boolean {
	const column = FIELDS[input.field].column;
	if (humanOwns({ ...input, column })) return false;

	return isEmpty({ ...input, column });
}

export type RecordFactInput = {
	contactId: string;
	field: FactField;
	value: string;
	evidence: Evidence[];
	method: string;
	sourceUrl?: string;
};

export type RecordFactResult = {
	stored: boolean;
	applied: boolean;
	band: FactBand | null;
	score: number;
	rationale: string;
	reason?: string;
};

export async function recordFact(
	input: RecordFactInput,
): Promise<RecordFactResult> {
	const trimmed = input.value.trim();

	const scored = scoreEvidence(input.evidence);
	const base = {
		score: scored.score,
		band: scored.band,
		rationale: scored.rationale,
	};

	if (!trimmed) {
		return { ...base, stored: false, applied: false, reason: "Empty value." };
	}

	if (scored.band === null) {
		return {
			...base,
			stored: false,
			applied: false,
			reason:
				"Below the floor for keeping — not stored. Find a source that identifies them, or leave the field alone.",
		};
	}

	const attempt: FactAttempt = {
		input,
		trimmed,
		band: scored.band,
		hasPrimary: scored.hasPrimary,
		base,
		sessionId: currentFocus().sessionId,
	};

	return db.$transaction(async (tx) => {
		await lockFactField(tx, input.contactId, input.field);
		return settleFact(tx, attempt, true);
	});
}

type FactAttempt = {
	input: RecordFactInput;
	trimmed: string;
	band: FactBand;
	hasPrimary: boolean;
	base: Pick<RecordFactResult, "score" | "band" | "rationale">;
	sessionId: string | null;
};

async function settleFact(
	tx: Prisma.TransactionClient,
	attempt: FactAttempt,
	retry: boolean,
): Promise<RecordFactResult> {
	const { input, trimmed, base } = attempt;
	const { contactId, field } = input;

	const contact = await readFactSubject(tx, contactId);

	if (!contact) {
		return {
			...base,
			stored: false,
			applied: false,
			reason: "No such contact.",
		};
	}

	const existing = await tx.contactFact.findMany({
		where: { contactId, field },
		select: { id: true, value: true, status: true },
	});

	if (
		existing.some(
			(fact) =>
				fact.status === FactStatus.DISMISSED && sameValue(fact.value, trimmed),
		)
	) {
		return {
			...base,
			stored: false,
			applied: false,
			reason:
				"A person has already dismissed this exact value. Do not offer it again.",
		};
	}

	const currentApplied = existing.find(
		(fact) => fact.status === FactStatus.APPLIED,
	);

	if (currentApplied && sameValue(currentApplied.value, trimmed)) {
		return {
			...base,
			stored: false,
			applied: false,
			reason: "Already on the record, from this same source. Nothing changed.",
		};
	}

	const column = FIELDS[field].column;
	const agentValue = currentApplied?.value ?? null;

	if (humanOwns({ field, column, contact, agentValue })) {
		return {
			...base,
			stored: false,
			applied: false,
			reason: `A person already filled in ${field}. That outranks anything found on the web.`,
		};
	}

	if (field === "name" && lessComplete(trimmed, contact)) {
		return {
			...base,
			stored: false,
			applied: false,
			reason:
				"The record already carries a fuller name than this one. A name is only ever replaced by one that says as much or more.",
		};
	}

	const applies =
		attempt.band === FactBand.VERIFIED ||
		(mayFillBlank(field, input.evidence) &&
			fillsBlank({ field, contact, agentValue }));

	if (
		!applies &&
		existing.some(
			(fact) =>
				fact.status === FactStatus.PROPOSED && sameValue(fact.value, trimmed),
		)
	) {
		return {
			...base,
			stored: false,
			applied: false,
			reason:
				"This exact value is already in front of a rep, waiting on them. Offering it twice only makes them read it twice.",
		};
	}

	if (
		applies &&
		!(await writeFactValue(tx, {
			contactId,
			field,
			value: trimmed,
			basis: contact,
		}))
	) {
		if (retry) return settleFact(tx, attempt, false);

		return {
			...base,
			stored: false,
			applied: false,
			reason:
				"The record changed while this was being written. Nothing was stored; read the record again before offering a value.",
		};
	}

	if (applies) {
		await tx.contactFact.updateMany({
			where: {
				contactId,
				field,
				status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] },
			},
			data: { status: FactStatus.SUPERSEDED, supersededAt: new Date() },
		});
	}

	await tx.contactFact.create({
		data: {
			contactId,
			field,
			value: trimmed,
			score: base.score,
			band: attempt.band,
			evidence: input.evidence as Prisma.InputJsonValue,
			method: input.method,
			sourceUrl: input.sourceUrl ?? null,
			sessionId: attempt.sessionId,
			status: applies ? FactStatus.APPLIED : FactStatus.PROPOSED,
		},
	});

	return {
		...base,
		stored: true,
		applied: applies,
		reason: applies
			? undefined
			: heldReason({
					field,
					evidence: input.evidence,
					hasPrimary: attempt.hasPrimary,
				}),
	};
}

export function lockFactField(
	tx: Prisma.TransactionClient,
	contactId: string,
	field: FactField,
): Promise<void> {
	return lockIdempotencyKey(tx, `fact:${contactId}:${field}`);
}

export function readFactSubject(
	tx: Prisma.TransactionClient,
	contactId: string,
): Promise<FactSubject | null> {
	return tx.contact.findUnique({
		where: { id: contactId },
		select: FACT_SUBJECT_SELECT,
	});
}

export async function writeFactValue(
	tx: Prisma.TransactionClient,
	input: {
		contactId: string;
		field: FactField;
		value: string;
		basis: FactSubject;
	},
): Promise<boolean> {
	const { contactId, field, value, basis } = input;
	const column = FIELDS[field].column;

	if (column) {
		const { count } = await tx.contact.updateMany({
			where: { id: contactId, [column]: basis[column] },
			data: { [column]: value },
		});
		return count === 1;
	}

	if (field !== "name") return true;

	const split = splitName(value);
	if (!split) return true;

	const { count } = await tx.contact.updateMany({
		where: {
			id: contactId,
			firstName: basis.firstName,
			lastName: basis.lastName,
			source: basis.source,
		},
		data: { firstName: split.firstName, lastName: split.lastName },
	});
	return count === 1;
}

export function mayFillBlank(field: FactField, evidence: Evidence[]): boolean {
	if (selfAssertedOnly(evidence)) return false;
	if (field !== "name") return true;

	return scoreEvidence(evidence).hasPrimary;
}

function heldReason(input: {
	field: FactField;
	evidence: Evidence[];
	hasPrimary: boolean;
}): string {
	if (selfAssertedOnly(input.evidence)) {
		return "The only source is text the sender wrote about themselves, and that alone never fills a field. Pair it with a reply from that address, a profile that carries it, or leave it as a proposal for a rep.";
	}

	if (input.field === "name" && !input.hasPrimary) {
		return "A name is written only from a source that identifies this person: a reply from their own address, a profile carrying that address, a matching LinkedIn or GitHub account, or a meeting they accepted. Nothing here does that, so this is kept as a proposal for a rep.";
	}

	return "The record already carries a value here, and only VERIFIED evidence may replace one, so this is kept as a proposal for a rep to accept or dismiss. This is a normal outcome, not a failure — do not try to raise the score.";
}

export async function lastEmployerChange(contactId: string) {
	const [previous, current] = await Promise.all([
		db.contactFact.findFirst({
			where: { contactId, field: "employer", status: FactStatus.SUPERSEDED },
			orderBy: { supersededAt: "desc" },
			select: { value: true, supersededAt: true },
		}),
		db.contactFact.findFirst({
			where: { contactId, field: "employer", status: FactStatus.APPLIED },
			orderBy: { observedAt: "desc" },
			select: { value: true, observedAt: true, sourceUrl: true },
		}),
	]);

	if (!previous || !current || sameValue(previous.value, current.value)) {
		return null;
	}

	return {
		from: previous.value,
		to: current.value,
		observedAt: current.observedAt,
		sourceUrl: current.sourceUrl,
	};
}

export type BriefSections = {
	currentRole?: string;
	tenure?: string;
	previousRoles?: string[];
	seniority?: string;
	function?: string;
	location?: string;
};

export async function writeBrief(input: {
	contactId: string;
	narrative: string;
	sections: BriefSections;
	evidence: Evidence[];
	sourceUrl?: string;
}): Promise<{ written: boolean; score: number; reason?: string }> {
	const scored = scoreEvidence(input.evidence);

	if (scored.band === null) {
		return {
			written: false,
			score: scored.score,
			reason: "Nothing here is sourced well enough to put on the record.",
		};
	}

	const data = {
		narrative: input.narrative.trim(),
		sections: input.sections as Prisma.InputJsonValue,
		score: scored.score,
		sourceUrl: input.sourceUrl ?? null,
		sessionId: currentFocus().sessionId,
		refreshedAt: new Date(),
	};

	await db.contactBrief.upsert({
		where: { contactId: input.contactId },
		create: { contactId: input.contactId, ...data },
		update: data,
	});

	return { written: true, score: scored.score };
}

function lessComplete(candidate: string, contact: FactSubject): boolean {
	const split = splitName(candidate);
	if (!split) return true;

	return shortensName(split, contact);
}

function recordName(contact: FactSubject): string {
	return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

function humanOwns({
	field,
	column,
	contact,
	agentValue,
}: {
	field: FactField;
	column: FactColumn | null;
	contact: FactSubject;
	agentValue: string | null;
}): boolean {
	if (field === "name") {
		if (contact.source === RecordSource.MANUAL) return true;
		if (agentValue !== null && !sameValue(agentValue, recordName(contact))) {
			return true;
		}
		return !isDerivedName(contact.email, contact.firstName, contact.lastName);
	}

	const value = column ? contact[column] : null;
	if (!value) return false;

	return agentValue === null || !sameValue(agentValue, value);
}

function isEmpty({
	field,
	column,
	contact,
	agentValue,
}: {
	field: FactField;
	column: FactColumn | null;
	contact: FactSubject;
	agentValue: string | null;
}): boolean {
	if (agentValue !== null) return false;
	if (field === "name") return true;
	if (!column) return true;

	return !contact[column];
}

const HOST_ALIASES = new Map([
	["twitter.com", "x.com"],
	["mobile.twitter.com", "x.com"],
]);

export function sameValue(a: string, b: string): boolean {
	return canonicalValue(a) === canonicalValue(b);
}

export function canonicalValue(value: string): string {
	const text = value.trim().replace(/\s+/g, " ").toLowerCase();
	const url = asWebUrl(text);

	if (!url) return text;

	const host = url.host.replace(/^www\./, "");
	const path = url.pathname.replace(/\/+$/, "");

	return `${HOST_ALIASES.get(host) ?? host}${path}`;
}

function asWebUrl(value: string): URL | null {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}
