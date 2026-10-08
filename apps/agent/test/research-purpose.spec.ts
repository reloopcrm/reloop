import { afterEach, describe, expect, it } from "bun:test";
import type { ToolContext } from "eve/tools";
import findContactSocials from "../agent/tools/find_contact_socials";
import researchCompany from "../agent/tools/research_company";
import researchPerson from "../agent/tools/research_person";
import setFieldValue from "../agent/tools/set_field_value";
import { inEveContext } from "./eve-context";

const sessionAs = (purpose: string) =>
	({
		session: {
			auth: { current: { attributes: { purpose } }, initiator: null },
		},
	}) as unknown as ToolContext;

const savedKey = process.env.PERPLEXITY_API_KEY;

afterEach(() => {
	if (savedKey === undefined) delete process.env.PERPLEXITY_API_KEY;
	else process.env.PERPLEXITY_API_KEY = savedKey;
});

const REFUSAL = "This CRM research tool is unavailable for this session.";

const calls = [
	[
		"research_person",
		(ctx: ToolContext) =>
			researchPerson.execute({ question: "Who is it?", deep: false }, ctx),
	],
	[
		"research_company",
		(ctx: ToolContext) =>
			researchCompany.execute({ companyId: "no-company" }, ctx),
	],
	[
		"find_contact_socials",
		(ctx: ToolContext) =>
			findContactSocials.execute({ contactId: "no-contact" }, ctx),
	],
	[
		"set_field_value",
		(ctx: ToolContext) =>
			setFieldValue.execute(
				{ entity: "CONTACT", recordId: "no-contact", key: "tier", value: "A" },
				ctx,
			),
	],
] as const;

describe("research tools refuse a session that is not research", () => {
	for (const purpose of ["builder", "team-agent"]) {
		for (const [name, call] of calls) {
			it(`${name} refuses a ${purpose} session`, async () => {
				process.env.PERPLEXITY_API_KEY = "pplx-test-key";

				await inEveContext(async () => {
					await expect(call(sessionAs(purpose))).rejects.toThrow(REFUSAL);
				});
			});
		}
	}
});
