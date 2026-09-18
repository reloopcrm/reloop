export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function toWorkspaceRole(value: string): WorkspaceRole {
	return isWorkspaceRole(value) ? value : "member";
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageCurrency(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageConnections(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageTracking(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canAssignRole(
	actor: WorkspaceRole | null,
	current: WorkspaceRole,
	next: WorkspaceRole,
): boolean {
	if (!canChangeRole(actor)) return false;
	if (actor === "owner") return true;

	return current !== "owner" && next !== "owner";
}

export function canLoadSampleData(role: WorkspaceRole | null): boolean {
	return role === "owner";
}
