import { Module } from "@nestjs/common";
import { DealsModule } from "../deals/deals.module";
import { TrpcModule } from "../trpc/trpc.module";
import { QuotesRouter } from "./quotes.router";
import { QuotesService } from "./quotes.service";

@Module({
	imports: [TrpcModule, DealsModule],
	providers: [QuotesService, QuotesRouter],
})
export class QuotesModule {}
