import { afterEach, describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import { readContextDevKey, writeContextDevKey } from "../src/settings";

const original = process.env.BETTER_AUTH_SECRET;
afterEach(() => {
	if (original === undefined) delete process.env.BETTER_AUTH_SECRET;
	else process.env.BETTER_AUTH_SECRET = original;
});

function storage(initial: string | null) {
	let stored = initial;
	const db = {
		appSetting: {
			findUnique: async () => ({ contextDevApiKey: stored }),
			upsert: async ({ update }: { update: { contextDevApiKey: string } }) => {
				stored = update.contextDevApiKey;
			},
			updateMany: async ({
				where,
				data,
			}: {
				where: { contextDevApiKey: string };
				data: { contextDevApiKey: string };
			}) => {
				if (stored === where.contextDevApiKey) stored = data.contextDevApiKey;
			},
		},
	} as unknown as Db;
	return { db, value: () => stored };
}

describe("stored research credentials", () => {
	it("reads back a cleared credential as no key", async () => {
		process.env.BETTER_AUTH_SECRET =
			"test-context-secret-with-at-least-32-characters";
		const row = storage(null);
		await writeContextDevKey(row.db, "");
		expect(await readContextDevKey(row.db)).toBeNull();
	});

	it("stores ciphertext and reads the original credential", async () => {
		process.env.BETTER_AUTH_SECRET =
			"test-context-secret-with-at-least-32-characters";
		const row = storage(null);
		await writeContextDevKey(row.db, "research-test-key");
		expect(row.value()).not.toContain("research-test-key");
		expect(row.value()?.startsWith("v1.")).toBe(true);
		expect(await readContextDevKey(row.db)).toBe("research-test-key");
	});
	it("upgrades a legacy credential during its next read", async () => {
		process.env.BETTER_AUTH_SECRET =
			"test-context-secret-with-at-least-32-characters";
		const row = storage("legacy-test-key");
		expect(await readContextDevKey(row.db)).toBe("legacy-test-key");
		expect(row.value()).not.toContain("legacy-test-key");
	});
	it("rejects corrupted ciphertext instead of sending it to the vendor", async () => {
		process.env.BETTER_AUTH_SECRET =
			"test-context-secret-with-at-least-32-characters";
		await expect(readContextDevKey(storage("v1.invalid").db)).rejects.toThrow();
	});
});

it("rejects an unsupported ciphertext version", async () => {
	process.env.BETTER_AUTH_SECRET =
		"test-context-secret-with-at-least-32-characters";
	await expect(readContextDevKey(storage("v2.invalid").db)).rejects.toThrow();
});

it("rejects credentials encrypted under an old key", async () => {
	process.env.BETTER_AUTH_SECRET =
		"test-context-secret-with-at-least-32-characters";
	const row = storage(null);
	await writeContextDevKey(row.db, "test-key");
	process.env.BETTER_AUTH_SECRET =
		"different-context-secret-with-at-least-32-characters";
	await expect(readContextDevKey(row.db)).rejects.toThrow();
});
