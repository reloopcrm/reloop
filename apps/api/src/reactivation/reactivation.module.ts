import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ReactivationRouter } from "./reactivation.router";
import { ReactivationService } from "./reactivation.service";
import { WinBackFollowUpController } from "./win-back-follow-up.controller";
import { WinBackFollowUpService } from "./win-back-follow-up.service";
import { WinBackPersonService } from "./win-back-person.service";
import { WinBackStoryPrefetchService } from "./win-back-story-prefetch.service";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [WinBackFollowUpController],
	providers: [
		ReactivationService,
		ReactivationRouter,
		WinBackFollowUpService,
		WinBackPersonService,
		WinBackStoryPrefetchService,
	],
	exports: [WinBackFollowUpService],
})
export class ReactivationModule {}
