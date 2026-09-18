import { Inject } from "@nestjs/common";
import { Ctx, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	sampleDataResultOutput,
	sampleDataStatusOutput,
} from "./demo.contracts";
import { DemoService } from "./demo.service";

@Router({ alias: "sampleData" })
@UseMiddlewares(AuthMiddleware)
export class DemoRouter {
	constructor(@Inject(DemoService) private readonly demo: DemoService) {}

	@Query({
		output: sampleDataStatusOutput,
		meta: restMeta("GET", "/sample-data", ["Sample data"]),
	})
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.demo.status(ctx.user.id);
	}

	@Mutation({
		output: sampleDataResultOutput,
		meta: restMeta("POST", "/sample-data/load", ["Sample data"]),
	})
	async load(@Ctx() ctx: AuthedTrpcContext) {
		return this.demo.load({
			id: ctx.user.id,
			name: ctx.user.name,
			email: ctx.user.email,
		});
	}

	@Mutation({
		output: sampleDataResultOutput,
		meta: restMeta("POST", "/sample-data/remove", ["Sample data"]),
	})
	async remove(@Ctx() ctx: AuthedTrpcContext) {
		return this.demo.remove(ctx.user.id);
	}
}
