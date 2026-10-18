import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";

const suffix = (process.env.TEST_RUN_ID ?? "research-on-demand").toLowerCase();
const createdDomain = `created-${suffix}.example.com`;
const mailDomain = `mail-${suffix}.example.com`;
const requestedDomain = `requested-${suffix}.example.com`;
const domains = [createdDomain, mailDomain, requestedDomain];

const agent = new AgentTriggerService(db);
const directory = new CompanyDirectoryService(agent);

let bridgeSecret: string | undefined;

async function companyIds(): Promise<string[]> {
	const rows = await db.company.findMany({
		where: { domain: { in: domains } },
		select: { id: true },
	});
	return rows.map((row) => row.id);
}

async function clean() {
	const ids = await companyIds();
	if (ids.length === 0) return;
	await db.agentTask.deleteMany({ where: { companyId: { in: ids } } });
	await db.company.deleteMany({ where: { id: { in: ids } } });
}

async function kindsFor(companyId: string): Promise<string[]> {
	const tasks = await db.agentTask.findMany({
		where: { companyId, finishedAt: null },
		select: { kind: true },
	});
	return tasks.map((task) => task.kind).sort();
}

beforeAll(async () => {
	bridgeSecret = process.env.AGENT_BRIDGE_SECRET;
	process.env.AGENT_BRIDGE_SECRET = "";
	await clean();
});

afterAll(async () => {
	await clean();

	if (bridgeSecret === undefined) {
		delete process.env.AGENT_BRIDGE_SECRET;
	} else {
		process.env.AGENT_BRIDGE_SECRET = bridgeSecret;
	}
});

describe("company research runs only on a click", () => {
	it("queues the brand read and no research for a new company", async () => {
		const company = await db.company.create({
			data: { name: "Created Example", domain: createdDomain },
			select: { id: true },
		});

		await agent.companyCreated(company.id);

		const kinds = await kindsFor(company.id);
		expect(kinds).toContain("brand");
		expect(kinds).not.toContain("company-profile");
	});

	it("queues no research for a company made from an email domain", async () => {
		const companyId = await directory.companyForEmail(`someone@${mailDomain}`);

		expect(companyId).not.toBeNull();
		const kinds = await kindsFor(companyId as string);
		expect(kinds).toContain("brand");
		expect(kinds).not.toContain("company-profile");
	});

	it("queues research when a rep asks for it", async () => {
		const company = await db.company.create({
			data: { name: "Requested Example", domain: requestedDomain },
			select: { id: true },
		});

		expect(await agent.companyRequested(company.id, "A rep asked")).toBe(true);

		const kinds = await kindsFor(company.id);
		expect(kinds).toContain("brand");
		expect(kinds).toContain("company-profile");
	});
});
