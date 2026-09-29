import type { WorkspaceScope } from "@crm/db/cloud/contract";

const SECOND_MS = 1000;

export const BILLING_PORT = Symbol("BILLING_PORT");

export type BillingPort = {
	cancelNow(scope: WorkspaceScope): Promise<void>;
	healStoredTarget(scope: WorkspaceScope): Promise<void>;
};

export const NO_BILLING_PORT: BillingPort = {
	cancelNow: () => Promise.resolve(),
	healStoredTarget: () => Promise.resolve(),
};

export const BILLING_SEAM = {
	webhook: { path: "/api/billing/webhook", maxBytes: 1_000_000 },
	return: { path: "/settings/billing" },
	schedule: { rebuildAfterMs: 30 * SECOND_MS },
} as const;
