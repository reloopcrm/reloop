import { Module } from "@nestjs/common";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ImapClientFactory } from "./imap.client";
import { ImapRouter } from "./imap.router";
import { ImapConnectionService } from "./imap-connection.service";
import { ImapCredentialService } from "./imap-credentials";
import { ImapSyncService } from "./imap-sync.service";

@Module({
	imports: [TrpcModule, MailboxModule],
	providers: [
		ImapClientFactory,
		ImapCredentialService,
		ImapSyncService,
		ImapConnectionService,
		ImapRouter,
	],
	exports: [ImapSyncService, ImapConnectionService],
})
export class ImapModule {}
