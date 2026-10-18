import { Inject } from "@nestjs/common";
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
	oauthAppInput,
	oauthAppRestartOutput,
	oauthAppStatusOutput,
	saveOAuthAppInput,
} from "./oauth-apps.contracts";
import { OAuthAppsService } from "./oauth-apps.service";

@Router({ alias: "oauthApp" })
@UseMiddlewares(AuthMiddleware)
export class OAuthAppsRouter {
	constructor(
		@Inject(OAuthAppsService) private readonly oauthApps: OAuthAppsService,
	) {}

	@Query({
		input: oauthAppInput,
		output: oauthAppStatusOutput,
		meta: restMeta("GET", "/oauth-app", ["Sign-in credentials"]),
	})
	status(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof oauthAppInput>,
	) {
		return this.oauthApps.status(ctx.user.id, input);
	}

	@Mutation({
		input: saveOAuthAppInput,
		output: oauthAppRestartOutput,
		meta: restMeta("PUT", "/oauth-app", ["Sign-in credentials"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	save(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof saveOAuthAppInput>,
	) {
		return this.oauthApps.save(ctx.user.id, input);
	}

	@Mutation({
		input: oauthAppInput,
		output: oauthAppRestartOutput,
		meta: restMeta("DELETE", "/oauth-app", ["Sign-in credentials"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	remove(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof oauthAppInput>,
	) {
		return this.oauthApps.remove(ctx.user.id, input);
	}
}
