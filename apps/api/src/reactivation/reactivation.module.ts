import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ReactivationRouter } from "./reactivation.router";
import { ReactivationService } from "./reactivation.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [ReactivationService, ReactivationRouter],
})
export class ReactivationModule {}
