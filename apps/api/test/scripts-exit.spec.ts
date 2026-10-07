import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import type { WorkspaceScope } from "@crm/db/cloud/contract";
import { cloud } from "@crm/db/cloud/scope";
import { main as refreshSummaries } from "../scripts/refresh-summaries";
import { main as threadContacts } from "../scripts/thread-contacts";
import { main as threadParticipants } from "../scripts/thread-participants";

const scripts = [
	["thread-participants", threadParticipants],
	["thread-contacts", threadContacts],
	["refresh-summaries", refreshSummaries],
] as const;

const store = new AsyncLocalStorage<WorkspaceScope>();
const selfHosted = { ...cloud };
const tenant = {
	id: "preview-tenant",
	slug: "preview-tenant",
	plan: "pro",
	allowList: [],
	createdAt: new Date(),
	trialEndsAt: null,
} as unknown as WorkspaceScope;

function tenantContextMissing(): never {
	const error = new Error("No tenant in context");
	error.name = "TenantContextMissing";
	throw error;
}

const calls = { disconnectClients: 0, close: 0 };
const argv = process.argv;
const log = console.log;

function actHosted(): void {
	calls.disconnectClients = 0;
	calls.close = 0;
	Object.assign(cloud, {
		hosted: () => true,
		scopeId: () => store.getStore()?.id ?? tenantContextMissing(),
		current: () => store.getStore() ?? tenantContextMissing(),
		run: <T>(scope: WorkspaceScope, fn: () => T): T => store.run(scope, fn),
		resolveClient: (single: () => unknown) =>
			store.getStore() ? single() : tenantContextMissing(),
		forEachScope: (fn: (signal: AbortSignal) => Promise<unknown>) =>
			store.run(tenant, () => fn(new AbortController().signal)),
		disconnectClients: async () => {
			calls.disconnectClients += 1;
		},
		close: async () => {
			calls.close += 1;
		},
	});
}

beforeEach(() => {
	process.argv = [...argv.slice(0, 2), "--dry-run"];
	console.log = () => undefined;
});

afterEach(() => {
	Object.assign(cloud, selfHosted);
	process.argv = argv;
	console.log = log;
});

describe("script exit", () => {
	for (const [name, main] of scripts) {
		it(`${name} finishes without an error on a self-hosted install`, async () => {
			await expect(main()).resolves.toBeUndefined();
		});

		it(`${name} finishes without TenantContextMissing in a hosted scope loop`, async () => {
			actHosted();
			await expect(main()).resolves.toBeUndefined();
			expect(calls.disconnectClients).toBe(1);
			expect(calls.close).toBe(1);
		});
	}
});
