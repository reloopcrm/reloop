import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { FIELD_PROPOSAL_KIND } from "@crm/validation/field-proposal";
import {
	type ChosenField,
	chooseFields,
	offerFields,
	type ProposedField,
	readProposalState,
} from "../agent/lib/field-proposals";

const KEY = "lane_proposal_spec";
const LABEL = "Lane proposal spec";

const lane: ProposedField = {
	entity: "DEAL",
	label: LABEL,
	type: "TEXT",
	options: [],
	agentBrief: "The route, from the city we load in to the city we drop in.",
	evidence: "12 mails name a route from one city to another.",
	seen: 12,
};

async function clear() {
	await db.agentTask.deleteMany({
		where: { kind: FIELD_PROPOSAL_KIND, subject: { contains: KEY } },
	});
	await db.fieldDefinition.deleteMany({ where: { key: { contains: KEY } } });
}

beforeEach(clear);
afterEach(clear);

async function proposeOnce(): Promise<ChosenField[]> {
	const state = await readProposalState();
	const chosen = chooseFields({ proposals: [lane], ...state });
	await offerFields(chosen);
	return chosen;
}

describe("a field proposal in the database", () => {
	it("is written with the evidence a person reads", async () => {
		const chosen = await proposeOnce();

		expect(chosen).toHaveLength(1);

		const row = await db.agentTask.findFirst({
			where: { kind: FIELD_PROPOSAL_KIND, subject: `DEAL:${KEY}` },
			select: { reason: true, payload: true, finishedAt: true, dueAt: true },
		});

		expect(row?.reason).toContain("12 mails");
		expect(row?.finishedAt).toBeNull();
		expect(row?.payload).toMatchObject({ entity: "DEAL", key: KEY, seen: 12 });
	});

	it("is not offered a second time while it waits", async () => {
		await proposeOnce();

		expect(await proposeOnce()).toEqual([]);
		expect(
			await db.agentTask.count({
				where: { kind: FIELD_PROPOSAL_KIND, subject: `DEAL:${KEY}` },
			}),
		).toBe(1);
	});

	it("is not offered again once a person dismissed it", async () => {
		await proposeOnce();

		await db.agentTask.updateMany({
			where: { kind: FIELD_PROPOSAL_KIND, subject: `DEAL:${KEY}` },
			data: {
				finishedAt: new Date(),
				outcome: "A person dismissed this field.",
			},
		});

		expect(await proposeOnce()).toEqual([]);
		expect(
			await db.agentTask.count({
				where: { kind: FIELD_PROPOSAL_KIND, subject: `DEAL:${KEY}` },
			}),
		).toBe(1);
	});

	it("is not offered again once the field exists", async () => {
		await db.fieldDefinition.create({
			data: {
				entity: "DEAL",
				key: KEY,
				label: LABEL,
				type: "TEXT",
				position: 0,
			},
		});

		expect(await proposeOnce()).toEqual([]);
	});
});
