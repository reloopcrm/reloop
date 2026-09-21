import { activeTenants, type Tenant, tenantById } from "@crm/db/tenancy";
import { currentTenantId, isHosted, runAsTenant } from "@crm/db/tenant-context";
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
	const auth = ctx?.session?.auth;
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

export function tenantTool<TInput, TOutput>(
	tool: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
	const execute = tool.execute.bind(tool);
	tool.execute = (input, ctx) => withTenant(ctx, () => execute(input, ctx));
	return tool;
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

	const outcomes: TenantRun[] = [];
	let tenants: Tenant[];
	try {
		tenants = only
			? [await tenantFromId(only)].filter((entry): entry is Tenant => !!entry)
			: rotated(await activeTenants(), rotation++);
	} catch (cause) {
		console.error(
			`[agent] ${label} could not list the tenants: ${cause instanceof Error ? cause.message : String(cause)}`,
		);
		return outcomes;
	}

	await runLimited(DISPATCH.tenants.concurrency, tenants, async (tenant) => {
		const outcome: TenantRun = {
			tenantId: tenant.id,
			ok: true,
			settled: true,
			error: null,
		};

		const work = runAsTenant(tenant, () => run(tenant)).then(
			() => undefined,
			(cause: unknown) => {
				outcome.ok = false;
				outcome.error = cause instanceof Error ? cause.message : String(cause);
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

export function withChannelTenant<T>(
	channel: { readonly state?: CrmChannelState },
	ctx: AuthContext | undefined,
	fn: () => Promise<T> | T,
): Promise<T> {
	return withTenantId(channel.state?.tenantId ?? tenantIdOf(ctx), fn);
}
