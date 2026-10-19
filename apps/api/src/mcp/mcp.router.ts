import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { SessionOnlyMiddleware } from "../trpc/middlewares/session-only.middleware";
import { restMeta } from "../trpc/openapi";
import { AiClientsService } from "./ai-clients.service";
import {
	mcpStatusOutput,
	type RevokeAiClientInput,
	revokeAiClientInput,
	revokeAiClientOutput,
} from "./mcp.contracts";

@Router({ alias: "mcp" })
@UseMiddlewares(AuthMiddleware, SessionOnlyMiddleware)
export class McpRouter {
	constructor(
		@Inject(AiClientsService) private readonly clients: AiClientsService,
	) {}

	@Query({
		output: mcpStatusOutput,
		meta: restMeta("GET", "/mcp/status", ["AI clients"]),
	})
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.clients.status(ctx.user.id);
	}

	@Mutation({
		input: revokeAiClientInput,
		output: revokeAiClientOutput,
		meta: restMeta("DELETE", "/mcp/clients/{id}", ["AI clients"]),
	})
	revoke(@Ctx() ctx: AuthedTrpcContext, @Input() input: RevokeAiClientInput) {
		return this.clients.revoke(ctx.user.id, input);
	}
}
