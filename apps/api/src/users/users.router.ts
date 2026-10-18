import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { UsersService } from "./users.service";

const userOutput = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

const usersListOutput = z.array(userOutput);

const renameInput = z.object({
	name: z.string().trim().min(1).max(80),
});

@Router({ alias: "users" })
@UseMiddlewares(AuthMiddleware)
export class UsersRouter {
	constructor(
		@Inject(UsersService) private readonly users: UsersService,
		@Inject(AuthService) private readonly auth: AuthService,
	) {}

	@Query()
	async me(@Ctx() ctx: AuthedTrpcContext) {
		return this.auth.getProfile(ctx.user.id);
	}

	@Query({
		output: usersListOutput,
		meta: restMeta("GET", "/users", ["Users"]),
	})
	async list() {
		return this.users.list();
	}

	@Mutation({
		input: renameInput,
		output: userOutput,
		meta: restMeta("PATCH", "/users/me", ["Users"]),
	})
	async rename(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof renameInput>,
	) {
		return this.users.rename(ctx.user.id, input.name);
	}
}
