import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import { imapSourceFor } from "../mailbox/mailbox.constants";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { SessionOnlyMiddleware } from "../trpc/middlewares/session-only.middleware";
import { restMeta } from "../trpc/openapi";
import {
	addImapAccountInput,
	imapAccountIdInput,
	imapPurgeOutput,
	imapRemoveOutput,
	imapStatusOutput,
	setImapCreateFromInput,
} from "./imap.contracts";
import { ImapConnectionService } from "./imap-connection.service";
import { ImapSyncService } from "./imap-sync.service";

@Router({ alias: "imap" })
@UseMiddlewares(AuthMiddleware)
export class ImapRouter {
	constructor(
		@Inject(ImapConnectionService)
		private readonly connection: ImapConnectionService,
		@Inject(ImapSyncService)
		private readonly sync: ImapSyncService,
	) {}

	@Query({
		output: imapStatusOutput,
		meta: restMeta("GET", "/imap/status", ["IMAP"]),
	})
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		input: addImapAccountInput,
		output: imapStatusOutput,
		meta: restMeta("POST", "/imap/accounts", ["IMAP"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	async add(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof addImapAccountInput>,
	) {
		return this.connection.add(ctx.user.id, input);
	}

	@Mutation({
		input: imapAccountIdInput,
		output: imapRemoveOutput,
		meta: restMeta("DELETE", "/imap/accounts/{id}", ["IMAP"]),
	})
	async remove(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.connection.remove(ctx.user.id, id);
	}

	@Mutation({
		input: imapAccountIdInput,
		output: imapPurgeOutput,
		meta: restMeta("POST", "/imap/accounts/{id}/purge-synced-data", ["IMAP"]),
	})
	async purgeSyncedData(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("id") id: string,
	) {
		return this.connection.purgeSyncedData(ctx.user.id, id);
	}

	@Mutation({
		input: imapAccountIdInput,
		output: imapStatusOutput,
		meta: restMeta("POST", "/imap/accounts/{id}/sync", ["IMAP"]),
	})
	async syncNow(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		await this.sync.runOne(ctx.user.id, imapSourceFor(id));
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		input: setImapCreateFromInput,
		output: imapStatusOutput,
		meta: restMeta("PATCH", "/imap/accounts/{id}/create-from", ["IMAP"]),
	})
	async setCreateFrom(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setImapCreateFromInput>,
	) {
		await this.connection.setCreateFrom(
			ctx.user.id,
			input.id,
			input.createFrom,
		);
		return this.connection.status(ctx.user.id);
	}
}
