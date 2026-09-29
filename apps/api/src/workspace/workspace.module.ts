import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { WorkspaceRouter } from "./workspace.router";
import { WorkspaceService } from "./workspace.service";
import { WorkspaceDeletionService } from "./workspace-deletion.service";

@Module({
	imports: [AgentModule, TrpcModule],
	providers: [WorkspaceService, WorkspaceDeletionService, WorkspaceRouter],
	exports: [WorkspaceService],
})
export class WorkspaceModule {}
