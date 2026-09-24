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
	billingOverviewOutput,
	billingPlansOutput,
	changePreviewOutput,
	checkoutInput,
	doneOutput,
	portalInput,
	portalOutput,
	setAddOnInput,
	urlOutput,
} from "./billing.contracts";
import { BillingService } from "./billing.service";

@Router({ alias: "billing" })
@UseMiddlewares(AuthMiddleware)
export class BillingRouter {
	constructor(
		@Inject(BillingService) private readonly billing: BillingService,
	) {}

	@Query({
		output: billingOverviewOutput,
		meta: restMeta("GET", "/billing", ["Billing"]),
	})
	async overview(@Ctx() ctx: AuthedTrpcContext) {
		return this.billing.overview(ctx.user.id);
	}

	@Query({
		output: billingPlansOutput,
		meta: restMeta("GET", "/billing/plans", ["Billing"]),
	})
	async plans(@Ctx() ctx: AuthedTrpcContext) {
		return this.billing.plans(ctx.user.id);
	}

	@Query({
		input: checkoutInput,
		output: changePreviewOutput,
		meta: restMeta("GET", "/billing/preview/plan", ["Billing"]),
	})
	async previewPlan(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof checkoutInput>,
	) {
		return this.billing.previewPlan(ctx.user.id, input);
	}

	@Query({
		input: setAddOnInput,
		output: changePreviewOutput,
		meta: restMeta("GET", "/billing/preview/add-on", ["Billing"]),
	})
	async previewAddOn(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAddOnInput>,
	) {
		return this.billing.previewAddOn(ctx.user.id, input);
	}

	@Mutation({
		input: checkoutInput,
		output: urlOutput,
		meta: restMeta("POST", "/billing/checkout", ["Billing"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async checkout(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof checkoutInput>,
	) {
		return this.billing.checkout(ctx.user.id, input);
	}

	@Mutation({
		input: setAddOnInput,
		output: urlOutput,
		meta: restMeta("PUT", "/billing/add-ons", ["Billing"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async setAddOn(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAddOnInput>,
	) {
		return this.billing.setAddOn(ctx.user.id, input);
	}

	@Mutation({
		output: doneOutput,
		meta: restMeta("POST", "/billing/cancel", ["Billing"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async cancel(@Ctx() ctx: AuthedTrpcContext) {
		return this.billing.cancel(ctx.user.id);
	}

	@Mutation({
		output: doneOutput,
		meta: restMeta("POST", "/billing/resume", ["Billing"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async resume(@Ctx() ctx: AuthedTrpcContext) {
		return this.billing.resume(ctx.user.id);
	}

	@Mutation({
		input: portalInput,
		output: portalOutput,
		meta: restMeta("POST", "/billing/portal", ["Billing"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async portal(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof portalInput>,
	) {
		return this.billing.portal(ctx.user.id, input);
	}
}
