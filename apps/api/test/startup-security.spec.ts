import { expect, it, spyOn } from "bun:test";
import { db } from "@crm/db";
import { AppRouterHost } from "nestjs-trpc";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

it("starts the API with database and background work replaced", async () => {
	const spies = [
		spyOn(db, "$connect").mockResolvedValue(undefined),
		spyOn(db, "$disconnect").mockResolvedValue(undefined),
		spyOn(
			DispatchHeartbeatService.prototype,
			"onApplicationBootstrap",
		).mockImplementation(() => {}),
		spyOn(
			MailboxSyncHeartbeatService.prototype,
			"onApplicationBootstrap",
		).mockImplementation(() => {}),
		spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
			() => {},
		),
	];
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	try {
		app = await createApp();
		expect(
			Object.keys(app.get(AppRouterHost).appRouter._def.procedures),
		).toContain("settings.setPassword");
	} finally {
		await app?.close();
		for (const spy of spies) spy.mockRestore();
	}
});
