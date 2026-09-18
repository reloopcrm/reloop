import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { ConversionService } from "../currency/conversion.service";
import { RatesService } from "../currency/rates.service";
import { GoogleModule } from "../google/google.module";
import { ImapModule } from "../imap/imap.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { ReactivationModule } from "../reactivation/reactivation.module";
import { MailboxSyncService } from "./mailbox-sync.service";
import { MailboxSyncHeartbeatService } from "./mailbox-sync-heartbeat.service";
import { SyncController } from "./sync.controller";

@Module({
	imports: [
		MailboxModule,
		GoogleModule,
		MicrosoftModule,
		ImapModule,
		AgentModule,
		ReactivationModule,
	],
	controllers: [SyncController],
	providers: [
		MailboxSyncService,
		MailboxSyncHeartbeatService,
		RatesService,
		ConversionService,
	],
	exports: [MailboxSyncService],
})
export class SyncModule {}
