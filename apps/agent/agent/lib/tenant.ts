import type { WorkspaceScope } from "@crm/db/cloud/contract";
import type { ToolDefinition } from "eve/tools";
import { inWorkspaceLanguage } from "./language";

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

export async function tenantFromId(
	_id: string | null | undefined,
): Promise<WorkspaceScope | null> {
	return null;
}

export function asTenant<T>(_tenant: WorkspaceScope | null, fn: () => T): T {
	return fn();
}

export async function withTenantId<T>(
	_id: string | null | undefined,
	fn: () => Promise<T> | T,
): Promise<T> {
	return inWorkspaceLanguage(fn);
}

export async function withTenant<T>(
	_ctx: AuthContext | null | undefined,
	fn: () => Promise<T> | T,
): Promise<T> {
	return inWorkspaceLanguage(fn);
}

export function tenantAttributes(): Record<string, string> {
	return {};
}

export function tenantTool<TInput, TOutput>(
	tool: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
	const execute = tool.execute.bind(tool);
	tool.execute = (input, ctx) => withTenant(ctx, () => execute(input, ctx));
	return tool;
}

export function tenantState<T>(initial: () => T): () => T {
	let state: { value: T } | null = null;

	return () => {
		state ??= { value: initial() };
		return state.value;
	};
}

export type TenantRun = {
	tenantId: string;
	ok: boolean;
	settled: boolean;
	error: string | null;
};

export async function eachActiveTenant(
	_label: string,
	run: (tenant: WorkspaceScope | null, signal: AbortSignal) => Promise<unknown>,
	_only: string | null = null,
): Promise<TenantRun[]> {
	await inWorkspaceLanguage(() => run(null, new AbortController().signal));
	return [];
}

export function tenantFromRequest(_request: Request): string | null {
	return null;
}

export type CrmChannelState = { tenantId: string | null };

export function channelState(): CrmChannelState {
	return { tenantId: null };
}

export function withChannelTenant<T>(
	_channel: { readonly state?: CrmChannelState },
	_ctx: AuthContext | undefined,
	fn: () => Promise<T> | T,
): Promise<T> {
	return inWorkspaceLanguage(fn);
}
