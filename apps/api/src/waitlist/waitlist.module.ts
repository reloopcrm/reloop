import { Module } from "@nestjs/common";
import { TrackingCounterService } from "../tracking/tracking-counter.service";
import { TrpcModule } from "../trpc/trpc.module";
import { WaitlistRouter } from "./waitlist.router";
import { WaitlistService } from "./waitlist.service";

@Module({
	imports: [TrpcModule],
	providers: [TrackingCounterService, WaitlistService, WaitlistRouter],
})
export class WaitlistModule {}
