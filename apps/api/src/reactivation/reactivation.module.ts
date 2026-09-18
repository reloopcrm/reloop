import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ReactivationRouter } from "./reactivation.router";
import { ReactivationService } from "./reactivation.service";
import { WinBackFollowUpController } from "./win-back-follow-up.controller";
import { WinBackFollowUpService } from "./win-back-follow-up.service";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [WinBackFollowUpController],
	providers: [ReactivationService, ReactivationRouter, WinBackFollowUpService],
	exports: [WinBackFollowUpService],
})
export class ReactivationModule {}
