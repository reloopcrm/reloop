import { type Db, db } from "@crm/db";
import { WORKSPACE_ID, workspaceSlug } from "@crm/db/workspace";
import { toWorkspaceRole, type WorkspaceRole } from "./roles";

export { WORKSPACE_ID };

export const DEFAULT_WORKSPACE_NAME = "CRM";

export async function ensureWorkspaceMembership(
	userId: string,
): Promise<string | undefined> {
	try {
		return await db.$transaction(async (tx) => {
			const workspace = await tx.organization.upsert({
				where: { id: WORKSPACE_ID },
				create: {
					id: WORKSPACE_ID,
					name: DEFAULT_WORKSPACE_NAME,
					slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
					createdAt: new Date(),
				},
				update: {},
				select: { id: true, name: true, slug: true },
			});

			const slug = workspaceSlug(workspace.name);

			if (workspace.slug !== slug) {
				await tx.organization.update({
					where: { id: workspace.id },
					data: { slug },
				});
			}

			const enrolled = await tx.member.count({
				where: { organizationId: workspace.id },
			});

			if (enrolled === 0) {
				const existing = await tx.user.findMany({
					select: { id: true },
					orderBy: [{ createdAt: "asc" }, { id: "asc" }],
				});

				await tx.member.createMany({
					data: existing.map((user, index) => ({
						id: crypto.randomUUID(),
						organizationId: workspace.id,
						userId: user.id,
						role: index === 0 ? "owner" : "member",
						createdAt: new Date(),
					})),
					skipDuplicates: true,
				});
			}

			await tx.member.upsert({
				where: {
					organizationId_userId: { organizationId: workspace.id, userId },
				},
				create: {
					id: crypto.randomUUID(),
					organizationId: workspace.id,
					userId,
					role: "member",
					createdAt: new Date(),
				},
				update: {},
			});

			return workspace.id;
		});
	} catch (error) {
		console.error(
			`[auth] could not enrol user ${userId} in workspace ${WORKSPACE_ID}; the next sign-in will retry`,
			error,
		);
		return undefined;
	}
}

export type WorkspaceMemberReader = Pick<Db, "member">;

export async function workspaceRoleOf(
	userId: string,
	client: WorkspaceMemberReader = db,
): Promise<WorkspaceRole | null> {
	const member = await client.member.findUnique({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		select: { role: true },
	});

	return member ? toWorkspaceRole(member.role) : null;
}

export const ORGANIZATION_READ_PATHS: readonly string[] = [
	"/organization/check-slug",
	"/organization/get-active-member",
	"/organization/get-active-member-role",
	"/organization/get-full-organization",
	"/organization/get-invitation",
	"/organization/get-role",
	"/organization/has-permission",
	"/organization/list",
	"/organization/list-invitations",
	"/organization/list-members",
	"/organization/list-roles",
	"/organization/list-team-members",
	"/organization/list-teams",
	"/organization/list-user-invitations",
	"/organization/list-user-teams",
];

export function isOrganizationWrite(path: string): boolean {
	return (
		path.startsWith("/organization/") && !ORGANIZATION_READ_PATHS.includes(path)
	);
}
