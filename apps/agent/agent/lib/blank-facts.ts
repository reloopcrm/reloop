import { db, FactStatus, type Prisma } from "@crm/db";
import { lockFactField } from "@crm/db/idempotency";
import { parseEvidence } from "./evidence";
import {
	canonicalValue,
	FACT_SUBJECT_SELECT,
	type FactField,
	type FactSubject,
	factColumn,
	fillsBlank,
	mayFillBlank,
	readFactSubject,
	writeFactValue,
} from "./facts";

const SCAN = 2000;

const MAX_FILLS = 500;

export type BlankFactFill = {
	contactId: string;
	contact: string;
	field: FactField;
	value: string;
	score: number;
	dropped: number;
};

export type BlankFactSweep = {
	scanned: number;
	filled: number;
	settled: number;
	waiting: number;
	unscanned: number;
	fills: BlankFactFill[];
};

export async function sweepBlankFacts(
	options: { dry?: boolean } = {},
): Promise<BlankFactSweep> {
	const [pending, proposals] = await Promise.all([
		db.contactFact.count({ where: { status: FactStatus.PROPOSED } }),
		db.contactFact.findMany({
			where: { status: FactStatus.PROPOSED },
			select: {
				id: true,
				contactId: true,
				field: true,
				value: true,
				score: true,
				evidence: true,
				contact: { select: FACT_SUBJECT_SELECT },
			},
			orderBy: [{ score: "desc" }, { observedAt: "desc" }],
			take: SCAN,
		}),
	]);

	const sweep: BlankFactSweep = {
		scanned: proposals.length,
		filled: 0,
		settled: 0,
		waiting: 0,
		unscanned: Math.max(0, pending - proposals.length),
		fills: [],
	};

	if (proposals.length === 0) return sweep;

	const applied = await appliedValues([
		...new Set(proposals.map((row) => row.contactId)),
	]);

	for (const group of groupByField(proposals)) {
		const [best] = group;
		const field = best.field as FactField;
		const contact: FactSubject = best.contact;
		const column = factColumn(field);
		const current = applied.get(key(best.contactId, field));

		if (!fillsBlank({ field, contact, agentValue: current ?? null })) {
			const value = current ?? (column ? contact[column] : null);
			const stale = redundant(group, value);

			sweep.waiting += group.length - stale.length;
			if (stale.length === 0) continue;

			if (!options.dry) {
				await db.contactFact.updateMany({
					where: { id: { in: stale.map((row) => row.id) } },
					data: { status: FactStatus.SUPERSEDED, supersededAt: new Date() },
				});
			}

			sweep.settled += stale.length;
			continue;
		}

		const candidate = group.find((row) => {
			const evidence = parseEvidence(row.evidence);
			return evidence !== null && mayFillBlank(field, evidence);
		});

		if (!candidate) {
			sweep.waiting += group.length;
			continue;
		}

		if (sweep.filled >= MAX_FILLS) {
			sweep.waiting += group.length;
			continue;
		}

		if (
			!options.dry &&
			!(await fill(candidate.id, candidate.contactId, field, candidate.value))
		) {
			sweep.waiting += group.length;
			continue;
		}

		sweep.filled += 1;
		sweep.settled += group.length - 1;
		sweep.fills.push({
			contactId: candidate.contactId,
			contact: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
			field,
			value: candidate.value,
			score: candidate.score,
			dropped: group.length - 1,
		});
	}

	return sweep;
}

type Proposal = {
	id: string;
	contactId: string;
	field: string;
	value: string;
	score: number;
	evidence: Prisma.JsonValue;
	contact: FactSubject;
};

async function appliedValues(
	contactIds: string[],
): Promise<Map<string, string>> {
	const values = new Map<string, string>();

	for (let start = 0; start < contactIds.length; start += 1000) {
		const rows = await db.contactFact.findMany({
			where: {
				status: FactStatus.APPLIED,
				contactId: { in: contactIds.slice(start, start + 1000) },
			},
			select: { contactId: true, field: true, value: true },
		});

		for (const row of rows)
			values.set(key(row.contactId, row.field), row.value);
	}

	return values;
}

function groupByField(proposals: Proposal[]): [Proposal, ...Proposal[]][] {
	const groups = new Map<string, [Proposal, ...Proposal[]]>();

	for (const row of proposals) {
		const id = key(row.contactId, row.field);
		const group = groups.get(id);
		if (group) group.push(row);
		else groups.set(id, [row]);
	}

	return [...groups.values()];
}

function redundant(group: Proposal[], value: string | null): Proposal[] {
	const onRecord = value ? canonicalValue(value) : null;
	const kept = new Set<string>();

	return group.filter((row) => {
		const seen = canonicalValue(row.value);
		if (seen === onRecord) return true;
		if (kept.has(seen)) return true;

		kept.add(seen);
		return false;
	});
}

async function fill(
	factId: string,
	contactId: string,
	field: FactField,
	value: string,
): Promise<boolean> {
	return db.$transaction(async (tx) => {
		await lockFactField(tx, contactId, field);

		const contact = await readFactSubject(tx, contactId);
		if (!contact) return false;

		const facts = await tx.contactFact.findMany({
			where: {
				contactId,
				field,
				status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] },
			},
			select: { id: true, value: true, status: true },
		});

		const candidate = facts.find(
			(fact) => fact.id === factId && fact.status === FactStatus.PROPOSED,
		);
		if (!candidate) return false;

		const agentValue =
			facts.find((fact) => fact.status === FactStatus.APPLIED)?.value ?? null;
		if (!fillsBlank({ field, contact, agentValue })) return false;

		if (
			!(await writeFactValue(tx, { contactId, field, value, basis: contact }))
		)
			return false;

		await tx.contactFact.updateMany({
			where: {
				contactId,
				field,
				id: { not: factId },
				status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] },
			},
			data: { status: FactStatus.SUPERSEDED, supersededAt: new Date() },
		});

		await tx.contactFact.update({
			where: { id: factId },
			data: { status: FactStatus.APPLIED },
		});

		return true;
	});
}

function key(contactId: string, field: string): string {
	return `${contactId}:${field}`;
}
