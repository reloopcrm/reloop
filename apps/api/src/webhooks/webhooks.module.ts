import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { WebhooksRouter } from "./webhooks.router";
import { WebhooksService } from "./webhooks.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [WebhooksService, WebhooksRouter],
})
export class WebhooksModule {}
