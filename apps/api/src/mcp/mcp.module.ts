import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { AiClientsService } from "./ai-clients.service";
import { McpRouter } from "./mcp.router";

@Module({
	imports: [TrpcModule],
	providers: [AiClientsService, McpRouter],
})
export class McpModule {}
