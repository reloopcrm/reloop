import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { API_KEY_HEADER, auth, setPasswordFor } from "@crm/auth";
import { db } from "@crm/db";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `agent-session-only-${suffix}`;
const domain = "example.com";
const email = `${userId}@${domain}`;
const password = "ein-sehr-langes-passwort-fuer-agenten";
const missingAgent = `missing-agent-${suffix}`;

const procedures = [
	{
		name: "agents.deploy",
		body: () => ({
			id: missingAgent,
			versionId: `missing-version-${suffix}`,
			clientRequestId: crypto.randomUUID(),
		}),
	},
	{
		name: "agents.saveFile",
		body: () => ({
			id: missingAgent,
			clientRequestId: crypto.randomUUID(),
			path: "agent.md",
			content: "Watch renewals.",
		}),
	},
	{
		name: "agents.revise",
		body: () => ({ id: missingAgent, clientRequestId: crypto.randomUUID() }),
	},
] as const;

describe("agent code changes need a session", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;
	let key = "";
	let cookie = "";
	let allowed: string | undefined;
	const spies: { mockRestore: () => void }[] = [];

	beforeAll(async () => {
		allowed = process.env.ALLOWED_SIGN_IN;
		process.env.ALLOWED_SIGN_IN = domain;

		spies.push(
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
			spyOn(db, "$disconnect").mockResolvedValue(undefined),
		);

		await db.user.create({
			data: {
				id: userId,
				email,
				name: "Agent Session Only",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		await setPasswordFor(userId, password);

		key = (
			await auth.api.createApiKey({
				body: { name: "agent session only spec", userId, expiresIn: null },
			})
		).key;

		const { headers } = await auth.api.signInEmail({
			body: { email, password },
			returnHeaders: true,
		});
		cookie = headers.getSetCookie().join("; ");

		app = await createApp();
		server = app.getHttpServer();
	});

	afterAll(async () => {
		await app?.close();
		await db.apikey.deleteMany({ where: { referenceId: userId } });
		await db.session.deleteMany({ where: { userId } });
		await db.account.deleteMany({ where: { userId } });
		await db.member.deleteMany({ where: { userId } });
		await db.user.deleteMany({ where: { id: userId } });
		for (const spy of spies) spy.mockRestore();

		if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
		else process.env.ALLOWED_SIGN_IN = allowed;
	});

	for (const procedure of procedures) {
		it(`refuses an API key on ${procedure.name}`, async () => {
			const response = await request(server)
				.post(`/api/trpc/${procedure.name}`)
				.set(API_KEY_HEADER, key)
				.send(procedure.body());

			expect([401, 403]).toContain(response.status);
		});

		it(`lets a session through to ${procedure.name}`, async () => {
			const response = await request(server)
				.post(`/api/trpc/${procedure.name}`)
				.set("Cookie", cookie)
				.send(procedure.body());

			expect(response.status).toBe(404);
		});
	}

	it("refuses an API key on the REST deploy route", async () => {
		const response = await request(server)
			.post(`/api/rest/agents/${missingAgent}/deploy`)
			.set(API_KEY_HEADER, key)
			.send({
				versionId: `missing-version-${suffix}`,
				clientRequestId: crypto.randomUUID(),
			});

		expect([401, 403]).toContain(response.status);
	});
});
