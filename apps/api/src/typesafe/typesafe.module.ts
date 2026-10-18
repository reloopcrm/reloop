import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { TypesafeRouter } from "./typesafe.router";
import { TypesafeService } from "./typesafe.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [TypesafeService, TypesafeRouter],
})
export class TypesafeModule {}
