import {
	type WaitlistConfirmInput,
	type WaitlistJoinInput,
	waitlistConfirmInput,
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

	@Query({
		output: z.object({ open: z.boolean() }),
		meta: restMeta("GET", "/waitlist/status", ["Waitlist"], {
			protect: false,
		}),
	})
	async status() {
		return this.waitlist.status();
	}

	@Mutation({
		input: waitlistJoinInput,
		output: z.object({ ok: z.literal(true) }),
		meta: restMeta("POST", "/waitlist/join", ["Waitlist"], { protect: false }),
	})
	async join(@Input() input: WaitlistJoinInput) {
		await this.waitlist.join(input.email);
		return { ok: true as const };
	}

	@Mutation({
		input: waitlistConfirmInput,
		output: z.object({ confirmed: z.boolean() }),
		meta: restMeta("POST", "/waitlist/confirm", ["Waitlist"], {
			protect: false,
		}),
	})
	async confirm(@Input() input: WaitlistConfirmInput) {
		return this.waitlist.confirm(input.token);
	}

	@Query({
		output: z.object({
			rows: z.array(
				z.object({
					email: z.string(),
					createdAt: z.string(),
					confirmedAt: z.string().nullable(),
				}),
			),
		}),
		meta: restMeta("GET", "/waitlist", ["Waitlist"]),
	})
	@UseMiddlewares(AuthMiddleware)
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.waitlist.list(ctx.user.id);
	}
}
