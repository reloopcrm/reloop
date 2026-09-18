import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { FIELD_LIMITS } from "@crm/db/fields-shape";
import {
	FIELD_PROPOSAL_KIND,
	type FieldProposalPayload,
} from "@crm/validation/field-proposal";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { FieldsService } from "../src/fields/fields.service";

const MARK = "proposal_spec";

const agent = {
	fieldBackfillRecords: async () => ({ queued: 0, merged: 0 }),
} as unknown as AgentTriggerService;

const fields = new FieldsService(db, agent);

const lane: FieldProposalPayload = {
	entity: "DEAL",
	key: `lane_${MARK}`,
	label: `Lane ${MARK}`,
	type: "TEXT",
	options: [],
	agentBrief: "The route, from the city we load in to the city we drop in.",
	seen: 12,
};

async function clear() {
	await db.agentTask.deleteMany({
		where: { kind: FIELD_PROPOSAL_KIND, subject: { contains: MARK } },
	});
	await db.fieldDefinition.deleteMany({ where: { key: { contains: MARK } } });
}

async function propose(
	payload: FieldProposalPayload = lane,
	reason = "12 mails name a route from one city to another.",
): Promise<string> {
	const row = await db.agentTask.create({
		data: {
			kind: FIELD_PROPOSAL_KIND,
			reason,
			subject: `${payload.entity}:${payload.key}`,
			payload,
			dueAt: new Date(),
			priority: 0,
			budget: 0,
		},
		select: { id: true },
	});

	return row.id;
}

beforeEach(clear);
afterEach(clear);

describe("a field proposal a person reads", () => {
	it("is listed for its own record type with the evidence that made it", async () => {
		await propose();

		const deals = await fields.proposals("DEAL");
		const contacts = await fields.proposals("CONTACT");

		expect(deals).toHaveLength(1);
		expect(deals[0]?.label).toBe(lane.label);
		expect(deals[0]?.typeLabel).toBe("Text");
		expect(deals[0]?.reason).toContain("12 mails");
		expect(contacts).toHaveLength(0);
	});

	it("becomes a real field when the person accepts it", async () => {
		const id = await propose();

		const result = await fields.decideProposal({ id, decision: "accept" });

		expect(result.accepted).toBe(true);

		const created = await fields.byKey("DEAL", lane.key);
		expect(created.label).toBe(lane.label);
		expect(created.agentBrief).toBe(lane.agentBrief);
		expect(created.agentFilled).toBe(true);

		expect(await fields.proposals("DEAL")).toHaveLength(0);
	});

	it("creates nothing when the person dismisses it", async () => {
		const id = await propose();

		const result = await fields.decideProposal({ id, decision: "dismiss" });

		expect(result.accepted).toBe(false);
		expect(await fields.proposals("DEAL")).toHaveLength(0);
		expect(await db.fieldDefinition.count({ where: { key: lane.key } })).toBe(
			0,
		);
	});

	it("cannot be decided twice", async () => {
		const id = await propose();
		await fields.decideProposal({ id, decision: "dismiss" });

		expect(fields.decideProposal({ id, decision: "accept" })).rejects.toThrow(
			"That proposal is already decided.",
		);
	});

	it("carries its select options onto the field", async () => {
		const id = await propose({
			...lane,
			key: `load_${MARK}`,
			label: `Load ${MARK}`,
			type: "SELECT",
			options: ["Pallets", "Container"],
		});

		await fields.decideProposal({ id, decision: "accept" });

		const created = await fields.byKey("DEAL", `load_${MARK}`);
		expect(created.options.map((option) => option.label)).toEqual([
			"Pallets",
			"Container",
		]);
	});
});

describe("the cap on how many fields a record type holds", () => {
	async function fill(count: number) {
		const last = await db.fieldDefinition.findFirst({
			where: { entity: "DEAL" },
			orderBy: { position: "desc" },
			select: { position: true },
		});

		await db.fieldDefinition.createMany({
			data: Array.from({ length: count }, (_, index) => ({
				entity: "DEAL" as const,
				key: `full_${index}_${MARK}`,
				label: `Full ${index} ${MARK}`,
				type: "TEXT" as const,
				position: (last?.position ?? -1) + 1 + index,
			})),
		});
	}

	it("refuses the next field once the record type is full", async () => {
		const live = await db.fieldDefinition.count({
			where: { entity: "DEAL", archivedAt: null },
		});

		await fill(Math.max(0, FIELD_LIMITS.perEntity - live));

		expect(
			fields.create({
				entity: "DEAL",
				label: `One too many ${MARK}`,
				type: "TEXT",
				options: [],
				agentFilled: true,
				agentBrief: null,
				required: false,
				showOnSheet: true,
				showOnTable: false,
				showOnFilter: false,
			}),
		).rejects.toThrow("as many fields as a sheet can show");
	});

	it("refuses an accepted proposal once the record type is full", async () => {
		const live = await db.fieldDefinition.count({
			where: { entity: "DEAL", archivedAt: null },
		});

		await fill(Math.max(0, FIELD_LIMITS.perEntity - live));
		const id = await propose();

		expect(fields.decideProposal({ id, decision: "accept" })).rejects.toThrow(
			"as many fields as a sheet can show",
		);
		expect(await fields.proposals("DEAL")).toHaveLength(1);
	});
});
