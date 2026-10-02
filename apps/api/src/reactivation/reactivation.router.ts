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
import { restMeta } from "../trpc/openapi";
import {
	potentialFeedbackOutput,
	reactivationListInput,
	reactivationListOutput,
	readingProgressOutput,
	rereadStoryOutput,
	setPotentialFeedbackInput,
	setWinBackRulesInput,
	setWinBackRulesModeInput,
	winBackNextInput,
	winBackNextOutput,
	winBackPersonViewInput,
	winBackPersonViewOutput,
	winBackRulesOutput,
	winBackRulesStateOutput,
} from "./reactivation.contracts";
import { ReactivationService } from "./reactivation.service";
import { WinBackPersonService } from "./win-back-person.service";

@Router({ alias: "reactivation" })
@UseMiddlewares(AuthMiddleware)
export class ReactivationRouter {
	constructor(
		@Inject(ReactivationService)
		private readonly reactivation: ReactivationService,
		@Inject(WinBackPersonService)
		private readonly people: WinBackPersonService,
	) {}

	@Query({
		input: winBackPersonViewInput,
		output: winBackPersonViewOutput,
		meta: restMeta("GET", "/reactivation/people/{contactId}", ["Reactivation"]),
	})
	async person(@Input("contactId") contactId: string) {
		return this.people.person(contactId);
	}

	@Query({
		input: winBackNextInput,
		output: winBackNextOutput,
		meta: restMeta("POST", "/reactivation/people/next", ["Reactivation"]),
	})
	async nextPerson(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof winBackNextInput>,
	) {
		return this.people.next(ctx.user.id, input);
	}

	@Mutation({
		input: winBackPersonViewInput,
		output: rereadStoryOutput,
		meta: restMeta("POST", "/reactivation/people/{contactId}/reread", [
			"Reactivation",
		]),
	})
	async rereadStory(@Input("contactId") contactId: string) {
		return this.people.rereadStory(contactId);
	}

	@Query({
		input: reactivationListInput,
		output: reactivationListOutput,
		meta: restMeta("POST", "/reactivation/search", ["Reactivation"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof reactivationListInput>,
	) {
		return this.reactivation.list(ctx.user.id, input);
	}

	@Query({
		output: winBackRulesOutput,
		meta: restMeta("GET", "/reactivation/rules", ["Reactivation"]),
	})
	async rules() {
		return this.reactivation.rules();
	}

	@Mutation({
		input: setWinBackRulesInput,
		output: winBackRulesOutput,
		meta: restMeta("PUT", "/reactivation/rules", ["Reactivation"]),
	})
	async setRules(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setWinBackRulesInput>,
	) {
		return this.reactivation.setRules(ctx.user.id, input.rules, input.keepMode);
	}

	@Mutation({
		input: setPotentialFeedbackInput,
		output: potentialFeedbackOutput,
		meta: restMeta("PUT", "/reactivation/feedback", ["Reactivation"]),
	})
	async setFeedback(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setPotentialFeedbackInput>,
	) {
		return this.reactivation.setFeedback(ctx.user.id, input);
	}

	@Query({
		output: readingProgressOutput,
		meta: restMeta("GET", "/reactivation/progress", ["Reactivation"]),
	})
	async progress() {
		return this.reactivation.progress();
	}

	@Query({
		output: winBackRulesStateOutput,
		meta: restMeta("GET", "/reactivation/rules-state", ["Reactivation"]),
	})
	async rulesState() {
		return this.reactivation.rulesState();
	}

	@Mutation({
		input: setWinBackRulesModeInput,
		output: winBackRulesStateOutput,
		meta: restMeta("PUT", "/reactivation/rules-mode", ["Reactivation"]),
	})
	async setRulesMode(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setWinBackRulesModeInput>,
	) {
		return this.reactivation.setRulesMode(ctx.user.id, input.mode);
	}

	@Mutation({
		output: winBackRulesStateOutput,
		meta: restMeta("POST", "/reactivation/rules-tune", ["Reactivation"]),
	})
	async tuneRulesNow(@Ctx() ctx: AuthedTrpcContext) {
		return this.reactivation.tuneRulesNow(ctx.user.id);
	}
}
