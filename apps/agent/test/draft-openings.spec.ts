import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { DRAFT, recentOpenings } from "../agent/lib/email-draft";

const suffix = process.env.TEST_RUN_ID ?? "draft-openings-spec";
const domain = `openings-${suffix}.test`;

async function person(local: string): Promise<string> {
	const row = await db.contact.create({
		data: {
			firstName: local,
			email: `${local}@${domain}`,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	return row.id;
}

async function draft(
	contactId: string,
	subject: string,
	body: string,
): Promise<void> {
	await db.emailDraft.create({ data: { contactId, subject, body } });
}

async function clean(): Promise<void> {
	const people = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	await db.contact.deleteMany({
		where: { id: { in: people.map((row) => row.id) } },
	});
}

beforeEach(clean);
afterEach(clean);

describe("what the agent is told about the mails it already wrote", () => {
	it("says nothing while no other draft exists", async () => {
		const id = await person("allein");

		expect(await recentOpenings(id)).toBe("");
	});

	it("names the opening of another contact's draft", async () => {
		const mine = await person("meiner");
		const other = await person("anderer");
		await draft(
			other,
			"Aktueller Palettenbedarf",
			"Hallo Frau Meier,\n\nwie sieht es aktuell bei Ihnen aus? Haben Sie Paletten?",
		);

		const said = await recentOpenings(mine);

		expect(said).toContain("Aktueller Palettenbedarf");
		expect(said).toContain("wie sieht es aktuell bei Ihnen aus?");
		expect(said).not.toContain("Hallo Frau Meier");
	});

	it("leaves my own draft out, so I do not avoid my own wording", async () => {
		const mine = await person("meiner2");
		await draft(
			mine,
			"Nur meiner",
			"Hallo,\n\ndas ist mein eigener langer Eroeffnungssatz hier.",
		);

		expect(await recentOpenings(mine)).toBe("");
	});

	it("stops at the cap, so the prompt stays small", async () => {
		const mine = await person("meiner3");
		for (let index = 0; index < DRAFT.recentDrafts + 4; index += 1) {
			const other = await person(`nachbar${index}`);
			await draft(
				other,
				`Betreff ${index}`,
				`Hallo,\n\ndas ist der Eroeffnungssatz nummer ${index} und lang genug.`,
			);
		}

		const lines = (await recentOpenings(mine))
			.split("\n")
			.filter((line) => line.startsWith("- "));

		expect(lines).toHaveLength(DRAFT.recentDrafts);
	});

	it("cuts an opening that is very long", async () => {
		const mine = await person("meiner4");
		const other = await person("langer");
		await draft(other, "Lang", `Hallo,\n\n${"a".repeat(400)}`);

		const said = await recentOpenings(mine);
		const line = said.split("\n").find((part) => part.startsWith("- ")) ?? "";

		expect(line.length).toBeLessThan(DRAFT.openingMaxChars + 40);
	});
});
