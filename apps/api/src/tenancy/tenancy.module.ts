import { Module } from "@nestjs/common";
import { TenantActivationHooks } from "./tenant-activation.hooks";
import { TenantSignupController } from "./tenant-signup.controller";
import { TenantSignupService } from "./tenant-signup.service";
import { TenantSweepController } from "./tenant-sweep.controller";
import { TenantSweepService } from "./tenant-sweep.service";

@Module({
	controllers: [TenantSignupController, TenantSweepController],
	providers: [TenantSignupService, TenantActivationHooks, TenantSweepService],
	exports: [TenantSweepService],
})
export class TenancyModule {}
