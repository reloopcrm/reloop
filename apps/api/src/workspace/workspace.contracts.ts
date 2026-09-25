import { PASSWORD_RULES, WORKSPACE_ROLES } from "@crm/auth";
import { LOCALES } from "@crm/db/locale";
import { MAX_SLUG } from "@crm/db/workspace";
import { z } from "zod";
import { SIGNUP } from "../tenancy/tenancy.config";
import { listInput } from "../trpc/list-input";

export const memberListInput = listInput.extend({
	role: z.array(z.string()).default([]),
});

export type MemberListInput = z.infer<typeof memberListInput>;

export const updateWorkspaceInput = z.object({
	name: z.string().trim().min(1).max(120),
	website: z.string().trim().min(1).max(255),
	slug: z
		.string()
		.trim()
		.min(1)
		.max(MAX_SLUG)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.optional(),
});

export const setMemberRoleInput = z.object({
	memberId: z.string().min(1),
	role: z.enum(WORKSPACE_ROLES),
});

export const addPersonInput = z.object({
	email: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email())
		.pipe(z.string().max(255)),
	name: z.string().trim().min(1).max(120),
	role: z.enum(WORKSPACE_ROLES),
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInput>;
export type SetMemberRoleInput = z.infer<typeof setMemberRoleInput>;
export type AddPersonInput = z.infer<typeof addPersonInput>;

export const workspaceOutput = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
	website: z.string().nullable(),
	onboarded: z.boolean(),
	viewerRole: z.enum(WORKSPACE_ROLES).nullable(),
	canRename: z.boolean(),
	canChangeRoles: z.boolean(),
	canAddPerson: z.boolean(),
});

export type Workspace = z.infer<typeof workspaceOutput>;

export const workspaceMemberOutput = z.object({
	id: z.string(),
	userId: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
	role: z.enum(WORKSPACE_ROLES),
	joinedAt: z.string(),
	isViewer: z.boolean(),
});

export type WorkspaceMember = z.infer<typeof workspaceMemberOutput>;

export const addedPersonOutput = z.object({
	member: workspaceMemberOutput,
	password: z.string(),
});

export type AddedPerson = z.infer<typeof addedPersonOutput>;

export const memberListOutput = z.object({
	rows: z.array(workspaceMemberOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

export const deletionCodeInput = z.object({ locale: z.enum(LOCALES) });

export const deleteWorkspaceInput = z.object({
	name: z.string().trim().min(1).max(120),
	reauth: z.discriminatedUnion("method", [
		z.object({
			method: z.literal("password"),
			password: z.string().min(1).max(PASSWORD_RULES.maxLength),
		}),
		z.object({
			method: z.literal("code"),
			code: z
				.string()
				.trim()
				.regex(new RegExp(`^\\d{${SIGNUP.code.digits}}$`)),
		}),
	]),
});

export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceInput>;

export const deletionCodeOutput = z.object({ ok: z.literal(true) });

export const deletedWorkspaceOutput = z.object({ finished: z.boolean() });

export type DeletedWorkspace = z.infer<typeof deletedWorkspaceOutput>;
