import { describe, expect, it } from "bun:test";
import { FIELD_LIMITS } from "@crm/db/fields-shape";
import {
	chooseFields,
	type ExistingField,
	fieldProposalSet,
	type ProposedField,
	roomFor,
} from "../agent/lib/field-proposals";

const lane: ProposedField = {
	entity: "DEAL",
	label: "Lane",
	type: "TEXT",
	options: [],
	agentBrief:
		"The route, written as the city we load in to the city we drop in.",
	evidence: "12 mails name a route from one city to another.",
	seen: 12,
};

const load: ProposedField = {
	entity: "DEAL",
	label: "Load",
	type: "SELECT",
	options: ["Pallets", "Container", "Loose"],
	agentBrief: "What the shipment is counted in.",
	evidence: "9 mails count pallets or containers.",
	seen: 9,
};

const once: ProposedField = {
	entity: "DEAL",
	label: "Ferry booking",
	type: "TEXT",
	options: [],
	agentBrief: "The ferry the driver is booked on.",
	evidence: "1 mail names a ferry.",
	seen: 1,
};

function fields(entity: "COMPANY" | "CONTACT" | "DEAL", count: number) {
	return Array.from({ length: count }, (_, index) => ({
		entity,
		key: `filled_${index}`,
		archived: false,
	})) satisfies ExistingField[];
}

describe("proposing a field for what the mail repeats", () => {
	it("takes a shape that repeats and leaves a shape that appeared once", () => {
		const chosen = chooseFields({
			proposals: [lane, load, once],
			fields: [],
			offered: [],
		});

		expect(chosen.map((field) => field.payload.label)).toEqual([
			"Lane",
			"Load",
		]);
		expect(chosen[0]?.payload.key).toBe("lane");
		expect(chosen[0]?.evidence).toContain("12 mails");
	});

	it("keeps the select's own words and drops options from every other type", () => {
		const chosen = chooseFields({
			proposals: [lane, load],
			fields: [],
			offered: [],
		});

		expect(chosen[0]?.payload.options).toEqual([]);
		expect(chosen[1]?.payload.options).toEqual([
			"Pallets",
			"Container",
			"Loose",
		]);
	});

	it("refuses a select with nothing to choose", () => {
		expect(
			chooseFields({
				proposals: [{ ...load, options: [] }],
				fields: [],
				offered: [],
			}),
		).toEqual([]);
	});

	it("proposes no more than the run allows", () => {
		const many = Array.from({ length: 10 }, (_, index) => ({
			...lane,
			label: `Lane ${index}`,
		}));

		expect(
			chooseFields({ proposals: many, fields: [], offered: [] }),
		).toHaveLength(FIELD_LIMITS.proposalsPerRun);
	});
});

describe("the cap on how many fields may exist", () => {
	it("leaves no room once a record type is full", () => {
		const room = roomFor(fields("DEAL", FIELD_LIMITS.perEntity), []);

		expect(room.DEAL).toBe(0);
		expect(room.COMPANY).toBe(FIELD_LIMITS.perEntity);
	});

	it("refuses the next proposal for a full record type", () => {
		expect(
			chooseFields({
				proposals: [lane, load],
				fields: fields("DEAL", FIELD_LIMITS.perEntity),
				offered: [],
			}),
		).toEqual([]);
	});

	it("counts a proposal already waiting against the cap", () => {
		const waiting = Array.from(
			{ length: FIELD_LIMITS.perEntity },
			(_, index) => `DEAL:waiting_${index}`,
		);

		expect(roomFor([], waiting).DEAL).toBe(0);
		expect(
			chooseFields({ proposals: [lane], fields: [], offered: waiting }),
		).toEqual([]);
	});

	it("does not count an archived field against the cap", () => {
		const archived = fields("DEAL", FIELD_LIMITS.perEntity).map((field) => ({
			...field,
			archived: true,
		}));

		expect(roomFor(archived, []).DEAL).toBe(FIELD_LIMITS.perEntity);
	});
});

describe("a field a person owns", () => {
	it("is never proposed again while it is on the record type", () => {
		expect(
			chooseFields({
				proposals: [lane],
				fields: [{ entity: "DEAL", key: "lane", archived: false }],
				offered: [],
			}),
		).toEqual([]);
	});

	it("is never proposed again after the person archived it", () => {
		expect(
			chooseFields({
				proposals: [lane],
				fields: [{ entity: "DEAL", key: "lane", archived: true }],
				offered: [],
			}),
		).toEqual([]);
	});

	it("does not block the same word on another record type", () => {
		const chosen = chooseFields({
			proposals: [{ ...lane, entity: "COMPANY" }],
			fields: [{ entity: "DEAL", key: "lane", archived: false }],
			offered: [],
		});

		expect(chosen).toHaveLength(1);
		expect(chosen[0]?.payload.entity).toBe("COMPANY");
	});
});

describe("a proposal a person already decided", () => {
	it("is never offered again", () => {
		expect(
			chooseFields({ proposals: [lane], fields: [], offered: ["DEAL:lane"] }),
		).toEqual([]);
	});

	it("does not stop a different field", () => {
		const chosen = chooseFields({
			proposals: [lane, load],
			fields: [],
			offered: ["DEAL:lane"],
		});

		expect(chosen.map((field) => field.payload.label)).toEqual(["Load"]);
	});

	it("is not offered twice inside one run", () => {
		const chosen = chooseFields({
			proposals: [lane, { ...lane, label: "lane" }],
			fields: [],
			offered: [],
		});

		expect(chosen).toHaveLength(1);
	});
});

describe("what the model is allowed to answer", () => {
	it("accepts an empty answer, because no field is a good answer", () => {
		const parsed = fieldProposalSet.safeParse({
			fields: [],
			note: "Nothing repeats often enough.",
		});

		expect(parsed.success).toBe(true);
		expect(parsed.data?.fields).toEqual([]);
	});

	it("refuses a type a person has to pick by hand", () => {
		expect(
			fieldProposalSet.safeParse({
				fields: [{ ...lane, type: "USER" }],
				note: "One field.",
			}).success,
		).toBe(false);
	});

	it("refuses a proposal with no evidence", () => {
		expect(
			fieldProposalSet.safeParse({
				fields: [{ ...lane, evidence: "  " }],
				note: "One field.",
			}).success,
		).toBe(false);
	});
});
