import {
	type WaitlistJoinInput,
	waitlistJoinInput,
} from "@crm/validation/waitlist";
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
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { WaitlistService } from "./waitlist.service";

@Router({ alias: "waitlist" })
export class WaitlistRouter {
	constructor(
		@Inject(WaitlistService) private readonly waitlist: WaitlistService,
	) {}

	@Mutation({
		input: waitlistJoinInput,
		output: z.object({ ok: z.literal(true) }),
		meta: restMeta("POST", "/waitlist/join", ["Waitlist"], { protect: false }),
	})
	async join(@Input() input: WaitlistJoinInput) {
		await this.waitlist.join(input.email);
		return { ok: true as const };
	}

	@Query({
		output: z.object({
			rows: z.array(z.object({ email: z.string(), createdAt: z.string() })),
			csv: z.string(),
		}),
		meta: restMeta("GET", "/waitlist", ["Waitlist"]),
	})
	@UseMiddlewares(AuthMiddleware)
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.waitlist.list(ctx.user.id);
	}
}
