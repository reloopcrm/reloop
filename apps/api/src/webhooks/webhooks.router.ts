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
	createWebhookInput,
	updateWebhookInput,
	webhookIdInput,
	webhookRemoveOutput,
	webhooksStatusOutput,
} from "./webhooks.contracts";
import { WebhooksService } from "./webhooks.service";

@Router({ alias: "webhooks" })
@UseMiddlewares(AuthMiddleware)
export class WebhooksRouter {
	constructor(
		@Inject(WebhooksService) private readonly webhooks: WebhooksService,
	) {}

	@Query({
		output: webhooksStatusOutput,
		meta: restMeta("GET", "/webhooks", ["Webhooks"]),
	})
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.webhooks.status(ctx.user.id);
	}

	@Mutation({
		input: createWebhookInput,
		output: webhooksStatusOutput,
		meta: restMeta("POST", "/webhooks", ["Webhooks"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createWebhookInput>,
	) {
		return this.webhooks.create(ctx.user.id, input);
	}

	@Mutation({
		input: updateWebhookInput,
		output: webhooksStatusOutput,
		meta: restMeta("PATCH", "/webhooks/{id}", ["Webhooks"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateWebhookInput>,
	) {
		return this.webhooks.update(ctx.user.id, input);
	}

	@Mutation({
		input: webhookIdInput,
		output: webhookRemoveOutput,
		meta: restMeta("DELETE", "/webhooks/{id}", ["Webhooks"]),
	})
	remove(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.webhooks.remove(ctx.user.id, id);
	}
}
