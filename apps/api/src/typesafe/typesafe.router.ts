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
	saveTypesafeKeyInput,
	typesafeStatusOutput,
} from "./typesafe.contracts";
import { TypesafeService } from "./typesafe.service";

@Router({ alias: "typesafe" })
@UseMiddlewares(AuthMiddleware)
export class TypesafeRouter {
	constructor(
		@Inject(TypesafeService) private readonly typesafe: TypesafeService,
	) {}

	@Query({
		output: typesafeStatusOutput,
		meta: restMeta("GET", "/typesafe", ["TypeSafe"]),
	})
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.typesafe.status(ctx.user.id);
	}

	@Mutation({
		input: saveTypesafeKeyInput,
		output: typesafeStatusOutput,
		meta: restMeta("PUT", "/typesafe", ["TypeSafe"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	save(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof saveTypesafeKeyInput>,
	) {
		return this.typesafe.save(ctx.user.id, input);
	}

	@Mutation({
		output: typesafeStatusOutput,
		meta: restMeta("DELETE", "/typesafe", ["TypeSafe"]),
	})
	disconnect(@Ctx() ctx: AuthedTrpcContext) {
		return this.typesafe.disconnect(ctx.user.id);
	}
}
