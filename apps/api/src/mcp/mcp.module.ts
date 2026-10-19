import { Module } from "@nestjs/common";
import { CompaniesModule } from "../companies/companies.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DealsModule } from "../deals/deals.module";
import { GoogleModule } from "../google/google.module";
import { ReactivationModule } from "../reactivation/reactivation.module";
import { SearchModule } from "../search/search.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AiClientsService } from "./ai-clients.service";
import { McpController } from "./mcp.controller";
import { McpRouter } from "./mcp.router";
import { McpServerFactory } from "./mcp-server";
import { McpToolsService } from "./mcp-tools.service";
import { WellKnownController } from "./well-known.controller";

@Module({
	imports: [
		TrpcModule,
		SearchModule,
		ContactsModule,
		CompaniesModule,
		DealsModule,
		ReactivationModule,
		GoogleModule,
	],
	controllers: [McpController, WellKnownController],
	providers: [AiClientsService, McpRouter, McpToolsService, McpServerFactory],
})
export class McpModule {}
