import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { DemoRouter } from "./demo.router";
import { DemoService } from "./demo.service";

@Module({
	imports: [TrpcModule],
	providers: [DemoService, DemoRouter],
})
export class DemoModule {}
