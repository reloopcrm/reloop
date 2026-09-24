import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { disconnectAll } from "@crm/db/client";
import { SETTINGS_ID } from "@crm/db/settings";
import { closeRegistry, type Tenant } from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { prepareTestTenants } from "@crm/db/test-tenants";
import {
	readAgentLanguage,
	writeAgentLanguage,
} from "@crm/validation/agent-language";
import { languageInstruction } from "../agent/instructions/task";
import { stallSkipped } from "../agent/lib/deal-stall";
import {
	currentLanguage,
	forgetWorkspaceLanguages,
} from "../agent/lib/language";
import { oneSidedReason } from "../agent/lib/rules-tuner";
import {
	eachActiveTenant,
	withTenant,
	withTenantId,
} from "../agent/lib/tenant";

type Saved = { existed: boolean; agentLanguage: string | null };

const saved = {
	registry: process.env.RELOOP_REGISTRY_URL,
	template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	german: process.env.RELOOP_GERMAN,
};

let a: Tenant;
let b: Tenant;
const before = new Map<string, Saved>();

async function remember(tenant: Tenant): Promise<void> {
	const row = await runAsTenant(tenant, () =>
		db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { agentLanguage: true },
		}),
	);
	before.set(tenant.id, {
		existed: row !== null,
		agentLanguage: row?.agentLanguage ?? null,
	});
}

async function restore(tenant: Tenant): Promise<void> {
	const was = before.get(tenant.id);
	if (!was) return;
	await runAsTenant(tenant, () =>
		was.existed
			? db.appSetting.update({
					where: { id: SETTINGS_ID },
					data: { agentLanguage: was.agentLanguage },
				})
			: db.appSetting.delete({ where: { id: SETTINGS_ID } }),
	);
}

function setEnv(name: string, value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

const hosted = {
	registry: undefined as string | undefined,
	template: undefined as string | undefined,
};

beforeAll(async () => {
	delete process.env.RELOOP_GERMAN;
	({ a, b } = await prepareTestTenants());
	hosted.registry = process.env.RELOOP_REGISTRY_URL;
	hosted.template = process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
	await Promise.all([remember(a), remember(b)]);
	await runAsTenant(a, () => writeAgentLanguage(db, "de"));
	await runAsTenant(b, () => writeAgentLanguage(db, "es"));
	forgetWorkspaceLanguages();
});

afterAll(async () => {
	await Promise.all([restore(a), restore(b)]);
	forgetWorkspaceLanguages();
	await disconnectAll();
	await closeRegistry();
	setEnv("RELOOP_REGISTRY_URL", saved.registry);
	setEnv("RELOOP_TENANT_DATABASE_URL_TEMPLATE", saved.template);
	setEnv("RELOOP_GERMAN", saved.german);
});

describe("the agent writes in the language of each workspace", () => {
	it("gives each tenant's session its own language", async () => {
		const first = await withTenantId(a.id, () => languageInstruction());
		const second = await withTenantId(b.id, () => languageInstruction());

		expect(first).toContain("in German.");
		expect(second).toContain("in Spanish.");
	});

	it("writes a fixed note in each tenant's language on the dispatch loop", async () => {
		const notes = new Map<string, string | null>();
		for (const tenant of [a, b]) {
			await eachActiveTenant(
				"language spec",
				async () => {
					notes.set(
						tenant.id,
						`${oneSidedReason({ good: 0, bad: 0 })} ${stallSkipped()}`,
					);
				},
				tenant.id,
			);
		}

		expect(notes.get(a.id)).toContain("Ich habe die Regeln nicht angepasst.");
		expect(notes.get(b.id)).toContain("No he cambiado las reglas.");
		expect(notes.get(a.id)).toContain("Es wurde keine Notiz geschrieben.");
		expect(notes.get(b.id)).toContain("No se ha escrito ninguna nota.");
	});

	it("keeps the env default for a self-hosted install with no setting", async () => {
		delete process.env.RELOOP_REGISTRY_URL;
		delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
		try {
			process.env.RELOOP_GERMAN = "true";
			forgetWorkspaceLanguages();
			expect(await readAgentLanguage(db)).toBeNull();
			expect(await withTenant(undefined, () => currentLanguage())).toBe("de");
			expect(
				await withTenant(undefined, () => languageInstruction()),
			).toContain("in German.");

			process.env.RELOOP_GERMAN = "false";
			forgetWorkspaceLanguages();
			expect(await withTenant(undefined, () => currentLanguage())).toBe("en");
		} finally {
			delete process.env.RELOOP_GERMAN;
			setEnv("RELOOP_REGISTRY_URL", hosted.registry);
			setEnv("RELOOP_TENANT_DATABASE_URL_TEMPLATE", hosted.template);
			forgetWorkspaceLanguages();
		}
	});
});
