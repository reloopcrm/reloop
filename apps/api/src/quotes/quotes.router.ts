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
	quoteCreatedOutput,
	quoteDismissedOutput,
	quoteListOutput,
	quoteThreadInput,
} from "./quotes.contracts";
import { QuotesService } from "./quotes.service";

@Router({ alias: "quotes" })
@UseMiddlewares(AuthMiddleware)
export class QuotesRouter {
	constructor(@Inject(QuotesService) private readonly quotes: QuotesService) {}

	@Query({
		output: quoteListOutput,
		meta: restMeta("GET", "/quotes/waiting", ["Quotes"]),
	})
	async list() {
		return this.quotes.list();
	}

	@Mutation({
		input: quoteThreadInput,
		output: quoteCreatedOutput,
		meta: restMeta("POST", "/quotes/create-deal", ["Quotes"]),
	})
	async createDeal(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof quoteThreadInput>,
	) {
		return this.quotes.create(ctx.user.id, input.threadId);
	}

	@Mutation({
		input: quoteThreadInput,
		output: quoteDismissedOutput,
		meta: restMeta("POST", "/quotes/dismiss", ["Quotes"]),
	})
	async dismiss(@Input() input: z.infer<typeof quoteThreadInput>) {
		return this.quotes.dismiss(input.threadId);
	}
}
