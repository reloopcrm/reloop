import { activeTenants, type Tenant, tenantById } from "@crm/db/tenancy";
import { currentTenantId, isHosted, runAsTenant } from "@crm/db/tenant-context";
import type { HookDefinition } from "eve/hooks";
import type { ToolDefinition } from "eve/tools";
import { z } from "zod";
import { settledWithin } from "./deadline";
import { DISPATCH } from "./dispatch-config";
import { runLimited } from "./pool";

export const TENANT_ATTRIBUTE = "tenantId";

export const TENANT_HEADER = "x-reloop-tenant";

type Attributes = Readonly<Record<string, string | readonly string[]>>;

type Principal = { readonly attributes?: Attributes } | null | undefined;

export type AuthContext = {
	readonly session: {
		readonly auth: {
			readonly current: Principal;
			readonly initiator: Principal;
		};
	};
};

const attributeText = z.string().trim().min(1).nullable().catch(null);

export function tenantIdOf(ctx: AuthContext | null | undefined): string | null {
	const auth = ctx?.session.auth;
	return (
		attributeText.parse(auth?.current?.attributes?.[TENANT_ATTRIBUTE]) ??
		attributeText.parse(auth?.initiator?.attributes?.[TENANT_ATTRIBUTE])
	);
}

export async function tenantFromId(
	id: string | null | undefined,
): Promise<Tenant | null> {
	if (!isHosted()) return null;
	if (!id) {
		throw new Error(
			"This session names no tenant. Hosted mode refuses work without one.",
		);
	}

	const tenant = await tenantById(id);
	if (!tenant) throw new Error(`Tenant ${id} is unknown.`);

	return tenant;
}

export function tenantOf(
	ctx: AuthContext | null | undefined,
): Promise<Tenant | null> {
	return tenantFromId(tenantIdOf(ctx));
}

export function asTenant<T>(tenant: Tenant | null, fn: () => T): T {
	return tenant ? runAsTenant(tenant, fn) : fn();
}

export async function withTenantId<T>(
	id: string | null | undefined,
	fn: () => Promise<T> | T,
): Promise<T> {
	return asTenant(await tenantFromId(id), fn);
}

export async function withTenant<T>(
	ctx: AuthContext | null | undefined,
	fn: () => Promise<T> | T,
): Promise<T> {
	return asTenant(await tenantOf(ctx), fn);
}

export function tenantAttributes(): Record<string, string> {
	const id = isHosted() ? currentTenantId() : null;
	return id ? { [TENANT_ATTRIBUTE]: id } : {};
}

type ContextLast = (...args: never[]) => unknown;

function ctxOf(args: readonly unknown[]): AuthContext | null {
	const last = args[args.length - 1];
	return last && typeof last === "object" && "session" in last
		? (last as AuthContext)
		: null;
}

function wrapped<F extends ContextLast>(handler: F): F {
	return ((...args: Parameters<F>) =>
		withTenant(ctxOf(args), () => handler(...args))) as unknown as F;
}

type Handlers = Record<string, ContextLast | undefined>;

export function tenantHandlers<T extends object>(handlers: T): T {
	const map = handlers as unknown as Handlers;
	for (const key of Object.keys(map)) {
		const handler = map[key];
		if (typeof handler === "function") map[key] = wrapped(handler);
	}
	return handlers;
}

export function tenantTool<T extends Pick<ToolDefinition, "execute">>(
	tool: T,
): T {
	const execute = tool.execute.bind(tool) as ContextLast;
	(tool as { execute: ContextLast }).execute = wrapped(execute);
	return tool;
}

export function tenantHook<T extends HookDefinition>(hook: T): T {
	if (hook.events) tenantHandlers(hook.events);
	return hook;
}

export function tenantState<T>(initial: () => T): () => T {
	const states = new Map<string, T>();

	return () => {
		const key = isHosted() ? currentTenantId() : null;
		const existing = states.get(key ?? "");
		if (existing !== undefined) return existing;

		const state = initial();
		states.set(key ?? "", state);
		return state;
	};
}

let rotation = 0;

export function rotated<T>(items: readonly T[], offset: number): T[] {
	if (items.length === 0) return [];
	const start = offset % items.length;
	return [...items.slice(start), ...items.slice(0, start)];
}

export type TenantRun = {
	tenantId: string;
	ok: boolean;
	settled: boolean;
	error: string | null;
};

export async function eachActiveTenant(
	label: string,
	run: (tenant: Tenant | null) => Promise<unknown>,
	only: string | null = null,
): Promise<TenantRun[]> {
	if (!isHosted()) {
		await run(null);
		return [];
	}

	const tenants = only
		? [await tenantFromId(only)].filter((entry): entry is Tenant => !!entry)
		: rotated(await activeTenants(), rotation++);
	const outcomes: TenantRun[] = [];

	await runLimited(DISPATCH.tenants.concurrency, tenants, async (tenant) => {
		const outcome: TenantRun = {
			tenantId: tenant.id,
			ok: true,
			settled: true,
			error: null,
		};

		const work = runAsTenant(tenant, () => run(tenant)).then(
			() => undefined,
			(error: unknown) => {
				outcome.ok = false;
				outcome.error = error instanceof Error ? error.message : String(error);
				console.error(
					`[agent] ${label} for tenant ${tenant.id}: ${outcome.error}`,
				);
			},
		);

		const finished = await settledWithin(work, DISPATCH.tenants.budgetMs);
		if (!finished.settled) {
			outcome.settled = false;
			console.error(
				`[agent] ${label} for tenant ${tenant.id} passed its ${DISPATCH.tenants.budgetMs}ms budget; the others go on`,
			);
		}

		outcomes.push(outcome);
	});

	return outcomes;
}

export function tenantFromRequest(request: Request): string | null {
	return attributeText.parse(request.headers.get(TENANT_HEADER));
}

export type CrmChannelState = { tenantId: string | null };

export function channelState(): CrmChannelState {
	return { tenantId: isHosted() ? currentTenantId() : null };
}

type ChannelHandler = (
	data: never,
	channel: { readonly state?: CrmChannelState },
	ctx?: AuthContext,
) => unknown;

export function tenantChannelEvents<T extends object>(events: T): T {
	const map = events as unknown as Record<string, ChannelHandler | undefined>;
	for (const key of Object.keys(map)) {
		const handler = map[key];
		if (typeof handler !== "function") continue;
		map[key] = (data, channel, ctx) =>
			withTenantId(channel.state?.tenantId ?? tenantIdOf(ctx), () =>
				handler(data, channel, ctx),
			);
	}
	return events;
}
