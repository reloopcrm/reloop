import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CompaniesModule } from "../companies/companies.module";
import { MailboxApiClient } from "./mailbox-api.client";
import { MailboxMatchService } from "./mailbox-match.service";
import { MailboxTokenService } from "./mailbox-token.service";
import { SyncStateService } from "./sync-state.service";
import { ThreadAdoptionService } from "./thread-adoption.service";
import { ThreadWriterService } from "./thread-writer.service";

@Module({
	imports: [AgentModule, CompaniesModule],
	providers: [
		MailboxApiClient,
		MailboxTokenService,
		MailboxMatchService,
		SyncStateService,
		ThreadWriterService,
		ThreadAdoptionService,
	],
	exports: [
		MailboxApiClient,
		MailboxTokenService,
		MailboxMatchService,
		SyncStateService,
		ThreadWriterService,
		ThreadAdoptionService,
	],
})
export class MailboxModule {}
