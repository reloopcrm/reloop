import { appUrl, clearedTenantCookieHeader } from "@crm/auth";
import { Inject, UnauthorizedException } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { SessionOnlyMiddleware } from "../trpc/middlewares/session-only.middleware";
import { restMeta } from "../trpc/openapi";
import {
	addedPersonOutput,
	addPersonInput,
	deletedWorkspaceOutput,
	deleteWorkspaceInput,
	deletionCodeInput,
	deletionCodeOutput,
	memberListInput,
	memberListOutput,
	setMemberRoleInput,
	updateWorkspaceInput,
	workspaceMemberOutput,
	workspaceOutput,
} from "./workspace.contracts";
import { WorkspaceService } from "./workspace.service";
import { WorkspaceDeletionService } from "./workspace-deletion.service";

@Router({ alias: "workspace" })
@UseMiddlewares(AuthMiddleware)
export class WorkspaceRouter {
	constructor(
		@Inject(WorkspaceService) private readonly workspace: WorkspaceService,
		@Inject(WorkspaceDeletionService)
		private readonly deletion: WorkspaceDeletionService,
	) {}

	@Query({
		output: workspaceOutput,
		meta: restMeta("GET", "/workspace", ["Workspace"]),
	})
	async get(@Ctx() ctx: AuthedTrpcContext) {
		return this.workspace.get(ctx.user.id);
	}

	@Query({
		input: memberListInput,
		output: memberListOutput,
		meta: restMeta("POST", "/workspace/members/search", ["Workspace"]),
	})
	async members(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof memberListInput>,
	) {
		return this.workspace.members(ctx.user.id, input);
	}

	@Mutation({
		input: updateWorkspaceInput,
		output: workspaceOutput,
		meta: restMeta("PATCH", "/workspace", ["Workspace"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateWorkspaceInput>,
	) {
		return this.workspace.update(ctx.user.id, input);
	}

	@Mutation({
		input: addPersonInput,
		output: addedPersonOutput,
		meta: restMeta("POST", "/workspace/members", ["Workspace"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async addPerson(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof addPersonInput>,
	) {
		if (!ctx.session) throw new UnauthorizedException();
		return this.workspace.addPerson(ctx.user.id, input, ctx.session.session);
	}

	@Mutation({
		input: setMemberRoleInput,
		output: workspaceMemberOutput,
		meta: restMeta("PATCH", "/workspace/members/{memberId}/role", [
			"Workspace",
		]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async setMemberRole(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setMemberRoleInput>,
	) {
		return this.workspace.setMemberRole(ctx.user.id, input);
	}

	@Mutation({
		input: deletionCodeInput,
		output: deletionCodeOutput,
		meta: restMeta("POST", "/workspace/deletion-code", ["Workspace"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async deletionCode(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof deletionCodeInput>,
	) {
		return this.deletion.sendCode(ctx.user, input.locale);
	}

	@Mutation({
		input: deleteWorkspaceInput,
		output: deletedWorkspaceOutput,
		meta: restMeta("POST", "/workspace/delete", ["Workspace"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async delete(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof deleteWorkspaceInput>,
	) {
		const deleted = await this.deletion.delete(ctx.user, input);
		ctx.req?.res?.append(
			"set-cookie",
			clearedTenantCookieHeader({
				secure: appUrl.startsWith("https://"),
				domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
			}),
		);
		return deleted;
	}
}
