import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db, FactBand, FactStatus } from "@crm/db";
import { sweepBlankFacts } from "../agent/lib/blank-facts";
import type { Evidence } from "../agent/lib/evidence";
import { recordFact } from "../agent/lib/facts";
import { holdContactRow } from "./row-gate";

const suffix = process.env.TEST_RUN_ID ?? "fact-race-spec";
const email = `race.subject.${suffix}@example.test`;

let contactId: string;

const seen = (kind: Evidence["kind"]): Evidence => ({
	kind,
	detail: "observed",
});

const probable = [seen("handle.name-form"), seen("search.cites-profile")];

beforeEach(async () => {
	await db.contact.deleteMany({ where: { email } });
	const contact = await db.contact.create({
		data: { firstName: "Race", lastName: "Subject", email },
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(async () => {
	await db.contact.deleteMany({ where: { email } });
});

function titleOf() {
	return db.contact
		.findUnique({ where: { id: contactId }, select: { title: true } })
		.then((contact) => contact?.title);
}

describe("recordFact under concurrency", () => {
	it("never overwrites a value a rep typed while the fact was being written", async () => {
		const gate = await holdContactRow(contactId, (tx) =>
			tx.contact.update({
				where: { id: contactId },
				data: { title: "Typed by a rep" },
			}),
		);

		const pending = recordFact({
			contactId,
			field: "title",
			value: "Found on the web",
			evidence: probable,
			method: "web",
		});

		await gate.waitForBlocked();
		await gate.release();
		const result = await pending;

		expect(result.applied).toBe(false);
		expect(await titleOf()).toBe("Typed by a rep");
		expect(
			await db.contactFact.count({
				where: { contactId, field: "title", status: FactStatus.APPLIED },
			}),
		).toBe(0);
	});

	it("puts one suggestion in front of a rep when two arrive at once", async () => {
		await recordFact({
			contactId,
			field: "title",
			value: "Head of Sales",
			evidence: [seen("profile.email-match")],
			method: "profile",
		});
		expect(await titleOf()).toBe("Head of Sales");

		const results = await Promise.all(
			[1, 2].map(() =>
				recordFact({
					contactId,
					field: "title",
					value: "Chief Revenue Officer",
					evidence: probable,
					method: "web",
				}),
			),
		);

		expect(
			await db.contactFact.count({
				where: { contactId, field: "title", status: FactStatus.PROPOSED },
			}),
		).toBe(1);
		expect(results.filter((result) => result.stored)).toHaveLength(1);
		expect(await titleOf()).toBe("Head of Sales");
	});
});

describe("sweepBlankFacts under concurrency", () => {
	it("never fills a field a rep typed after the sweep read it", async () => {
		const offer = await db.contactFact.create({
			data: {
				contactId,
				field: "title",
				value: "Found on the web",
				score: 0.61,
				band: FactBand.PROBABLE,
				evidence: [{ kind: "web.cited-claim", detail: "a page said so" }],
				method: "web",
				status: FactStatus.PROPOSED,
			},
			select: { id: true },
		});

		const gate = await holdContactRow(contactId, (tx) =>
			tx.contact.update({
				where: { id: contactId },
				data: { title: "Typed by a rep" },
			}),
		);

		const pending = sweepBlankFacts();

		await gate.waitForBlocked();
		await gate.release();
		await pending;

		expect(await titleOf()).toBe("Typed by a rep");
		const fact = await db.contactFact.findUnique({
			where: { id: offer.id },
			select: { status: true },
		});
		expect(fact?.status).not.toBe(FactStatus.APPLIED);
	});
});
