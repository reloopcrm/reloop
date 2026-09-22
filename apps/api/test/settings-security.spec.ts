import { describe, expect, it } from "bun:test";
import { API_KEY_PREFIX } from "@crm/auth";
import type { Db } from "@crm/db";
import { SettingsService } from "../src/settings/settings.service";

function settings(role: string | null) {
	const db = {
		member: { findUnique: async () => (role ? { role } : null) },
	} as unknown as Db;
	const unused = undefined as never;
	return new SettingsService(db, unused, unused, unused);
}

describe("workspace settings authorization", () => {
	it("rejects member writes before any provider or database mutation", async () => {
		const service = settings("member");
		const writes = [
			() => service.setAgentProvider("member", {} as never),
			() => service.setArchiveRetention("member", 30),
			() => service.forgetDraftStyleRule("member", "rule"),
			() =>
				service.setAgentFunction("member", {
					id: "thread-insight",
					enabled: false,
				}),
			() => service.refreshUsage("member"),
			() => service.chatgptLogin("member", "start"),
			() => service.chatgptLogin("member", "status"),
		];
		for (const write of writes)
			await expect(write()).rejects.toThrow("Only a workspace admin");
	});
	it("refuses a ChatGPT sign-in on a hosted install", async () => {
		const saved = process.env.RELOOP_REGISTRY_URL;
		process.env.RELOOP_REGISTRY_URL = "http://registry.test";
		try {
			const service = settings("owner");
			const attempts = [
				() => service.chatgptLogin("owner", "start"),
				() => service.chatgptLogin("owner", "status"),
				() =>
					service.setAgentProvider("owner", { provider: "chatgpt" } as never),
			];
			for (const attempt of attempts)
				await expect(attempt()).rejects.toThrow("not offered on a hosted");
		} finally {
			if (saved === undefined) delete process.env.RELOOP_REGISTRY_URL;
			else process.env.RELOOP_REGISTRY_URL = saved;
		}
	});
	it("never lends the operator's OpenRouter key to a hosted own-key plan", async () => {
		const db = {
			member: { findUnique: async () => ({ role: "owner" }) },
			appSetting: { findUnique: async () => ({ plan: "hosting" }) },
		} as unknown as Db;
		const config = { get: () => "sk-or-operator" } as never;
		const service = new SettingsService(
			db,
			undefined as never,
			config,
			undefined as never,
		);
		const attempt = () =>
			service.setAgentProvider("owner", { provider: "openrouter" } as never);

		const saved = process.env.RELOOP_REGISTRY_URL;
		process.env.RELOOP_REGISTRY_URL = "http://registry.test";
		try {
			await expect(attempt()).rejects.toThrow("Paste an OpenRouter API key");
		} finally {
			if (saved === undefined) delete process.env.RELOOP_REGISTRY_URL;
			else process.env.RELOOP_REGISTRY_URL = saved;
		}

		const single = await attempt().catch((error: Error) => error);
		expect(String(single)).not.toContain("Paste an OpenRouter API key");
	});
	it("does not let an owner remove commercial limits through the API", async () => {
		await expect(settings("owner").setPlan("owner", null)).rejects.toThrow(
			"Only the server operator",
		);
	});
	it("requires recent authentication before a password change", async () => {
		await expect(
			settings("owner").setPassword(
				"owner",
				"long-test-password",
				{ createdAt: new Date(0), token: "browser-session" },
				"session",
			),
		).rejects.toThrow("Sign out and sign in again");
	});
});

it("refuses a password change on a session minted from an API key", async () => {
	await expect(
		settings("owner").setPassword(
			"owner",
			"long-test-password",
			{ createdAt: new Date(), token: `${API_KEY_PREFIX}live-key` },
			"session",
		),
	).rejects.toThrow("Sign out and sign in again");
});

for (const createdAt of [new Date(Number.NaN), new Date(Date.now() + 60_000)]) {
	it("rejects invalid password session timestamps", async () => {
		await expect(
			settings("owner").setPassword(
				"owner",
				"long-test-password",
				{ createdAt, token: "browser-session" },
				"session",
			),
		).rejects.toThrow("Sign out and sign in again");
	});
}

it("rejects member changes to global win-back rules", async () => {
	const { ReactivationService } = await import(
		"../src/reactivation/reactivation.service"
	);
	const db = {
		member: { findUnique: async () => ({ role: "member" }) },
	} as unknown as Db;
	const service = new ReactivationService(db, undefined as never);
	await expect(service.setRules("member", {} as never, false)).rejects.toThrow(
		"Only a workspace admin",
	);
	await expect(service.setRulesMode("member", "auto")).rejects.toThrow(
		"Only a workspace admin",
	);
	await expect(service.tuneRulesNow("member")).rejects.toThrow(
		"Only a workspace admin",
	);
});

it("rejects member changes to the global domain exclusion list", async () => {
	const { GoogleConnectionService } = await import(
		"../src/google/google-connection.service"
	);
	const db = {
		member: { findUnique: async () => ({ role: "member" }) },
	} as unknown as Db;
	const unused = undefined as never;
	const service = new GoogleConnectionService(
		db,
		unused,
		unused,
		unused,
		unused,
	);
	await expect(
		service.suppressDomain("member", "example.org", { purge: true }),
	).rejects.toThrow("Only a workspace admin");
});

for (const role of ["owner", "admin"]) {
	it(`allows ${role} to change archive retention`, async () => {
		let written = false;
		const db = {
			member: { findUnique: async () => ({ role }) },
			appSetting: {
				upsert: async () => {
					written = true;
				},
			},
		} as unknown as Db;
		const unused = undefined as never;
		const service = new SettingsService(db, unused, unused, unused);
		expect(await service.setArchiveRetention("test", 30)).toEqual({ days: 30 });
		expect(written).toBe(true);
	});
}
