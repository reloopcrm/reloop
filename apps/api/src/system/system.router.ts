import { Inject } from "@nestjs/common";
import { Ctx, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { updateOutput, versionOutput } from "./system.contracts";
import { SystemService } from "./system.service";

@Router({ alias: "system" })
@UseMiddlewares(AuthMiddleware)
export class SystemRouter {
	constructor(@Inject(SystemService) private readonly system: SystemService) {}

	@Query({
		output: versionOutput,
		meta: restMeta("GET", "/system/version", ["System"]),
	})
	async version(@Ctx() ctx: AuthedTrpcContext) {
		return this.system.version(ctx.user.id);
	}

	@Mutation({
		output: versionOutput,
		meta: restMeta("POST", "/system/version/check", ["System"]),
	})
	async checkVersion(@Ctx() ctx: AuthedTrpcContext) {
		return this.system.version(ctx.user.id, true);
	}

	@Mutation({
		output: updateOutput,
		meta: restMeta("POST", "/system/update", ["System"]),
	})
	async update(@Ctx() ctx: AuthedTrpcContext) {
		return this.system.update(ctx.user.id);
	}
}
