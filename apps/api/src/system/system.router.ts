import { Inject } from "@nestjs/common";
import { Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { versionOutput } from "./system.contracts";
import { SystemService } from "./system.service";

@Router({ alias: "system" })
@UseMiddlewares(AuthMiddleware)
export class SystemRouter {
	constructor(@Inject(SystemService) private readonly system: SystemService) {}

	@Query({
		output: versionOutput,
		meta: restMeta("GET", "/system/version", ["System"]),
	})
	async version() {
		return this.system.version();
	}
}
