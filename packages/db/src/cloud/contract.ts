import type { Db } from "../client";
import type { PlanLimits } from "../plans";

declare const workspaceScope: unique symbol;

export type WorkspaceScope = {
	readonly [workspaceScope]: true;
	readonly id: string;
	readonly slug: string;
	readonly plan: string;
	readonly allowList: readonly string[];
	readonly createdAt: Date;
	readonly trialEndsAt: Date | null;
};

export type ScopeOutcome<T> =
	| { tenantId: string; ok: true; result: T }
	| { tenantId: string; ok: false; error: string };

export type ScopeLoop<T> = { tenants: ScopeOutcome<T>[] };

export type ScopeLoopOptions = {
	concurrency?: number;
	budgetMs?: number;
};

export type CreateClient = (connectionString: string, max?: number) => Db;

export type PlanOption = { id: string; label: string };

export type UsageWindow = { since: Date; until: Date; trialEnds: boolean };

export type CloudPlans = {
	limitsOf(plan: string | null | undefined): PlanLimits;
	withAddOns(limits: PlanLimits): PlanLimits;
	usageWindow(plan: string | null | undefined, now: Date): UsageWindow | null;
	isTrial(plan: string | null | undefined): boolean;
	options(): readonly PlanOption[];
};

export const BILLING_INTERVALS = ["month", "year"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export type PlanPurchase = { plan: string; interval: BillingInterval };

export type CloudScope = {
	readonly loop: { readonly budgetMs: number };
	readonly plans: CloudPlans;
	hosted(): boolean;
	customer(): boolean;
	operatorId(): string | null;
	scopeId(): string | null;
	current(): WorkspaceScope;
	scopedKey(key: string): string;
	hold<T>(fn: () => T): T;
	run<T>(scope: WorkspaceScope, fn: () => T): T;
	byId(id: string): Promise<WorkspaceScope | null>;
	activeBySite(siteId: string): Promise<WorkspaceScope | null>;
	active(): Promise<WorkspaceScope[]>;
	forEachScope<T>(
		fn: (signal: AbortSignal) => Promise<T>,
		options?: ScopeLoopOptions,
	): Promise<T | ScopeLoop<T>>;
	resolveClient(single: () => Db, create: CreateClient): Db;
	disconnectClients(): Promise<void>;
	ping(): Promise<void>;
	close(): Promise<void>;
	onMemberAdded(email: string): Promise<void>;
	onMemberRemoved(email: string): Promise<void>;
};
