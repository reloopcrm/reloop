import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { SystemRouter } from "./system.router";
import { SystemService } from "./system.service";

@Module({
	imports: [TrpcModule],
	providers: [SystemService, SystemRouter],
})
export class SystemModule {}
