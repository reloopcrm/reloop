import type { Db } from "../client";
import type { AddOnQuantities } from "../plans";

export type WorkspaceScope = {
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

export type CloudScope = {
	readonly loop: { readonly budgetMs: number };
	readonly backup: { readonly retentionDays: number };
	hosted(): boolean;
	customer(): boolean;
	operatorId(): string | null;
	scopeId(): string | null;
	current(): WorkspaceScope;
	addOns(): Readonly<AddOnQuantities>;
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
