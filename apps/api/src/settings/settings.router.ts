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
	agentFunctionsOutput,
	agentProviderOutput,
	archiveRetentionOutput,
	businessProposalOutput,
	chatgptLoginInput,
	chatgptLoginOutput,
	dealStagesOutput,
	draftStyleOutput,
	forgetDraftStyleRuleInput,
	passwordSignInOutput,
	planOutput,
	setAgentFunctionInput,
	setAgentProviderInput,
	setArchiveRetentionDaysInput,
	setDealStageNameInput,
	setPasswordInput,
	setPlanInput,
	spendOutput,
} from "./settings.contracts";
import { SettingsService } from "./settings.service";

@Router({ alias: "settings" })
@UseMiddlewares(AuthMiddleware)
export class SettingsRouter {
	constructor(
		@Inject(SettingsService) private readonly settings: SettingsService,
	) {}

	@Mutation({
		output: businessProposalOutput,
		meta: restMeta("POST", "/settings/business-proposal", ["Settings"]),
	})
	async proposeBusiness(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.proposeBusiness(ctx.user.id);
	}

	@Query({
		output: agentProviderOutput,
		meta: restMeta("GET", "/settings/agent-provider", ["Settings"]),
	})
	async agentProvider() {
		return this.settings.agentProvider();
	}

	@Mutation({
		input: setAgentProviderInput,
		output: agentProviderOutput,
		meta: restMeta("PATCH", "/settings/agent-provider", ["Settings"]),
	})
	async setAgentProvider(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAgentProviderInput>,
	) {
		return this.settings.setAgentProvider(ctx.user.id, input);
	}

	@Mutation({
		output: agentProviderOutput,
		meta: restMeta("POST", "/settings/agent-provider/refresh-usage", [
			"Settings",
		]),
	})
	async refreshUsage(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.refreshUsage(ctx.user.id);
	}

	@Query({
		output: chatgptLoginOutput,
		meta: restMeta("GET", "/settings/agent-provider/chatgpt-login", [
			"Settings",
		]),
	})
	async chatgptLogin(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.chatgptLogin(ctx.user.id, "status");
	}

	@Mutation({
		input: chatgptLoginInput,
		output: chatgptLoginOutput,
		meta: restMeta("POST", "/settings/agent-provider/chatgpt-login", [
			"Settings",
		]),
	})
	async chatgptLoginAction(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof chatgptLoginInput>,
	) {
		return this.settings.chatgptLogin(ctx.user.id, input.action);
	}

	@Query({
		output: planOutput,
		meta: restMeta("GET", "/settings/plan", ["Settings"]),
	})
	async plan() {
		return this.settings.plan();
	}

	@Mutation({
		input: setPlanInput,
		output: planOutput,
		meta: restMeta("PUT", "/settings/plan", ["Settings"]),
	})
	async setPlan(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setPlanInput>,
	) {
		return this.settings.setPlan(ctx.user.id, input.plan);
	}

	@Query({
		output: spendOutput,
		meta: restMeta("GET", "/settings/spend", ["Settings"]),
	})
	async spend() {
		return this.settings.spend();
	}

	@Query({
		output: passwordSignInOutput,
		meta: restMeta("GET", "/settings/password", ["Settings"]),
	})
	async passwordSignIn(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.passwordSignIn(ctx.user.id);
	}

	@Mutation({
		input: setPasswordInput,
		output: passwordSignInOutput,
		meta: restMeta("PUT", "/settings/password", ["Settings"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async setPassword(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setPasswordInput>,
	) {
		if (!ctx.session) throw new UnauthorizedException();
		return this.settings.setPassword(
			ctx.user.id,
			input.newPassword,
			ctx.session.session.createdAt,
			ctx.session.session.id,
		);
	}

	@Query({
		output: archiveRetentionOutput,
		meta: restMeta("GET", "/settings/archive-retention", ["Settings"]),
	})
	async archiveRetention() {
		return this.settings.archiveRetention();
	}

	@Mutation({
		input: setArchiveRetentionDaysInput,
		output: archiveRetentionOutput,
		meta: restMeta("PATCH", "/settings/archive-retention", ["Settings"]),
	})
	async setArchiveRetention(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setArchiveRetentionDaysInput>,
	) {
		return this.settings.setArchiveRetention(ctx.user.id, input.days);
	}

	@Query({
		output: agentFunctionsOutput,
		meta: restMeta("GET", "/settings/agent-functions", ["Settings"]),
	})
	async agentFunctions(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.agentFunctions(ctx.user.id);
	}

	@Mutation({
		input: setAgentFunctionInput,
		output: agentFunctionsOutput,
		meta: restMeta("PATCH", "/settings/agent-functions", ["Settings"]),
	})
	async setAgentFunction(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAgentFunctionInput>,
	) {
		return this.settings.setAgentFunction(ctx.user.id, input);
	}

	@Query({
		output: draftStyleOutput,
		meta: restMeta("GET", "/settings/draft-style", ["Settings"]),
	})
	async draftStyle() {
		return this.settings.draftStyle();
	}

	@Mutation({
		input: forgetDraftStyleRuleInput,
		output: draftStyleOutput,
		meta: restMeta("POST", "/settings/draft-style/forget", ["Settings"]),
	})
	async forgetDraftStyleRule(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof forgetDraftStyleRuleInput>,
	) {
		return this.settings.forgetDraftStyleRule(ctx.user.id, input.ruleId);
	}

	@Query({
		output: dealStagesOutput,
		meta: restMeta("GET", "/settings/deal-stages", ["Settings"]),
	})
	async dealStages(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.dealStages(ctx.user.id);
	}

	@Mutation({
		input: setDealStageNameInput,
		output: dealStagesOutput,
		meta: restMeta("PATCH", "/settings/deal-stages", ["Settings"]),
	})
	async setDealStageName(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setDealStageNameInput>,
	) {
		return this.settings.setDealStageName(ctx.user.id, input);
	}
}
