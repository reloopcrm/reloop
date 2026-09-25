import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { BillingModule } from "../billing/billing.module";
import { TenancyModule } from "../tenancy/tenancy.module";
import { TrpcModule } from "../trpc/trpc.module";
import { WorkspaceRouter } from "./workspace.router";
import { WorkspaceService } from "./workspace.service";
import { WorkspaceDeletionService } from "./workspace-deletion.service";

@Module({
	imports: [AgentModule, TrpcModule, BillingModule, TenancyModule],
	providers: [WorkspaceService, WorkspaceDeletionService, WorkspaceRouter],
	exports: [WorkspaceService],
})
export class WorkspaceModule {}
