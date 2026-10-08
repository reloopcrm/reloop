import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { quickSearchTerm, SEARCH } from "@crm/validation/search";
import { SearchService } from "../src/search/search.service";
import { listInput } from "../src/trpc/list-input";

const suffix = process.env.TEST_RUN_ID ?? "quick-search-spec";
const domain = `quick-search-${suffix}.test`;
const userId = `user-${suffix}-quick-search`;
const tag = `Zqx${suffix.replace(/[^a-z0-9]/gi, "")}`;
const service = new SearchService(db);

let activeCompanyId = "";
let archivedCompanyId = "";

beforeAll(async () => {
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Search Tester",
			email: `search@${domain}`,
			emailVerified: true,
		},
		update: {},
	});
	const active = await db.company.create({
		data: { name: `${tag} Active Co`, domain: `active.${domain}` },
		select: { id: true },
	});
	const archived = await db.company.create({
		data: {
			name: `${tag} Archived Co`,
			domain: `archived.${domain}`,
			archivedAt: new Date(),
		},
		select: { id: true },
	});
	activeCompanyId = active.id;
	archivedCompanyId = archived.id;
	await db.contact.createMany({
		data: [
			{
				firstName: `${tag}Anna`,
				lastName: "Meier",
				email: `anna@${domain}`,
				companyId: activeCompanyId,
			},
			{
				firstName: `${tag}Archivedanna`,
				lastName: "Meier",
				email: `old@${domain}`,
				companyId: activeCompanyId,
				archivedAt: new Date(),
			},
			{
				firstName: "",
				lastName: null,
				email: null,
				companyId: activeCompanyId,
			},
		],
	});
	await db.deal.createMany({
		data: [
			{
				name: `${tag} Open Deal`,
				companyId: activeCompanyId,
				ownerId: userId,
			},
			{
				name: `${tag} Archived Deal`,
				companyId: activeCompanyId,
				ownerId: userId,
				archivedAt: new Date(),
			},
		],
	});
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { name: { startsWith: tag } } });
	await db.contact.deleteMany({ where: { companyId: activeCompanyId } });
	await db.company.deleteMany({
		where: { id: { in: [activeCompanyId, archivedCompanyId] } },
	});
	await db.user.deleteMany({ where: { id: userId } });
});

describe("the quick search", () => {
	it("returns no archived company, contact or deal", async () => {
		const { hits } = await service.quick(tag);
		const labels = hits.map((hit) => hit.label);

		expect(labels).toContain(`${tag} Active Co`);
		expect(labels).toContain(`${tag} Open Deal`);
		expect(labels).not.toContain(`${tag} Archived Co`);
		expect(labels).not.toContain(`${tag} Archived Deal`);
		expect(labels).not.toContain(`${tag}Archivedanna Meier`);
	});

	it("finds a person by first and last name together", async () => {
		const { hits } = await service.quick(`${tag}Anna Meier`);

		expect(hits.map((hit) => hit.label)).toEqual([`${tag}Anna Meier`]);
	});

	it("finds a person by a word of their company name", async () => {
		const { hits } = await service.quick(`${tag}Anna Active`);

		expect(hits.map((hit) => hit.label)).toEqual([`${tag}Anna Meier`]);
	});

	it("returns a null label for a contact without name and email", async () => {
		const unnamed = await db.contact.findFirstOrThrow({
			where: { companyId: activeCompanyId, firstName: "" },
			select: { id: true },
		});
		const { hits } = await service.quick(`${tag} Active`);

		expect(hits.find((hit) => hit.id === unnamed.id)?.label).toBeNull();
	});

	it("returns at most the configured hits per kind", async () => {
		const { hits } = await service.quick(tag);

		expect(
			hits.filter((hit) => hit.kind === "deal").length,
		).toBeLessThanOrEqual(SEARCH.perKind);
	});
});

describe("the quick search term", () => {
	it("trims the term", () => {
		expect(quickSearchTerm.parse("  abc  ")).toBe("abc");
	});

	it("rejects a term over the maximum length", () => {
		expect(
			quickSearchTerm.safeParse("a".repeat(SEARCH.maxLength + 1)).success,
		).toBe(false);
	});

	it("keeps only the first words of a long term", () => {
		const words = Array.from(
			{ length: SEARCH.maxWords + 4 },
			(_, i) => `w${i}`,
		);

		expect(quickSearchTerm.parse(words.join(" "))).toBe(
			words.slice(0, SEARCH.maxWords).join(" "),
		);
	});
});

describe("the list input", () => {
	it("rejects a page beyond the maximum", () => {
		expect(listInput.safeParse({ page: 10_000_000 }).success).toBe(false);
	});

	it("rejects a sort key that is far too long", () => {
		expect(listInput.safeParse({ sort: "x".repeat(500) }).success).toBe(false);
	});

	it("keeps a normal sort key and page", () => {
		expect(listInput.safeParse({ sort: "name", page: 3 }).success).toBe(true);
	});
});
