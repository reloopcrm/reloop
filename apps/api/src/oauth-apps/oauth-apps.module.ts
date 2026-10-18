import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { OAuthAppsRouter } from "./oauth-apps.router";
import { OAuthAppsService } from "./oauth-apps.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [OAuthAppsService, OAuthAppsRouter],
})
export class OAuthAppsModule {}
