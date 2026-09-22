import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { TENANT_COOKIE_NAME } from "@crm/auth";
import { dbNameOf, dropDatabase } from "@crm/db/provision";
import {
	closeRegistry,
	forgetTenants,
	removeTenant,
	tenantById,
	tenantDatabaseUrl,
} from "@crm/db/tenancy";
import {
	prepareTestTenants,
	registryQuery,
	TEST_TENANTS,
} from "@crm/db/test-tenants";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { type Mail, MailService } from "../src/mail/mail.service";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const runId = (process.env.TEST_RUN_ID ?? "spec")
	.toLowerCase()
	.replace(/[^a-z0-9]/g, "");
const password = "ein-langes-passwort-fuer-den-code";
const newPassword = "ein-anderes-langes-passwort-danach";

const company = `Codeco ${runId}`;
const tenantId = `codeco-${runId}`;
const owner = `owner@codeco-${runId}.example`;
const signup = {
	email: owner,
	name: "Owner",
	company,
	plan: "trial",
	locale: "de",
};

const cookieOf = (response: request.Response): string =>
	String(response.headers["set-cookie"] ?? "")
		.split(",")
		.map((part) => part.split(";")[0]?.trim() ?? "")
		.find((part) => part.startsWith(`${TENANT_COOKIE_NAME}=`)) ?? "";

const codeIn = (mail: Mail): string => /\b(\d{6})\b/.exec(mail.text)?.[1] ?? "";

describe("tenant sign-up with a mailed code", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
		resend: process.env.RESEND_API_KEY,
		from: process.env.MAIL_FROM,
	};
	const spies: { mockRestore: () => void }[] = [];
	const outbox: Mail[] = [];
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;

	const wipe = async () => {
		await removeTenant(tenantId).catch(() => undefined);
		await dropDatabase(tenantDatabaseUrl(dbNameOf(tenantId))).catch(
			() => undefined,
		);
	};

	beforeAll(async () => {
		await prepareTestTenants();
		await wipe();
		process.env.RESEND_API_KEY = "re_test";
		process.env.MAIL_FROM = "Reloop <noreply@example.test>";

		spies.push(
			spyOn(MailService.prototype, "send").mockImplementation(async (mail) => {
				outbox.push(mail);
				return true;
			}),
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
		);

		app = await createApp();
		server = app.getHttpServer();
	});

	afterAll(async () => {
		try {
			await app?.close();
			await wipe();
			await closeRegistry();
		} finally {
			for (const spy of spies) spy.mockRestore();
			for (const [key, value] of [
				["RELOOP_REGISTRY_URL", saved.registry],
				["RELOOP_TENANT_DATABASE_URL_TEMPLATE", saved.template],
				["RESEND_API_KEY", saved.resend],
				["MAIL_FROM", saved.from],
			] as const) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}
	});

	it("offers a password sign-up when mail is on", async () => {
		const response = await request(server).get("/api/tenant/options");
		expect(response.status).toBe(200);
		expect(response.body.password).toBe(true);
	});

	it("registers a pending workspace and mails a German code", async () => {
		const response = await request(server)
			.post("/api/tenant/signup")
			.send({ ...signup, password });

		expect(response.status).toBe(201);
		expect(response.body).toEqual({ tenantId, next: "verify-email" });
		expect(cookieOf(response)).toStartWith(
			`${TENANT_COOKIE_NAME}=${tenantId}.`,
		);
		expect((await tenantById(tenantId))?.status).toBe("pending");

		const mail = outbox.at(-1);
		expect(mail?.to).toBe(owner);
		expect(mail?.subject).toContain("Dein Reloop Code");
		expect(mail?.text).toContain("Hallo Owner,");
		expect(codeIn(mail as Mail)).toHaveLength(6);
		expect(mail?.html).toContain(codeIn(mail as Mail));
	}, 120_000);

	it("refuses a second sign-up inside the resend window", async () => {
		const response = await request(server)
			.post("/api/tenant/signup")
			.send({ ...signup, password });
		expect(response.status).toBe(429);
	});

	it("locks the code after five wrong tries", async () => {
		const wrong = { email: owner, code: "000000" };
		const answers: string[] = [];
		for (let index = 0; index < 5; index += 1) {
			const response = await request(server)
				.post("/api/tenant/verify")
				.send(wrong);
			expect(response.status).toBe(400);
			answers.push(response.body.code);
		}
		expect(answers).toEqual([
			"CODE_INVALID",
			"CODE_INVALID",
			"CODE_INVALID",
			"CODE_INVALID",
			"CODE_LOCKED",
		]);

		const right = await request(server)
			.post("/api/tenant/verify")
			.send({ email: owner, code: codeIn(outbox.at(-1) as Mail) });
		expect(right.status).toBe(400);
		expect(right.body.code).toBe("CODE_LOCKED");
		expect((await tenantById(tenantId))?.status).toBe("pending");
	});

	it("sends a new code after 60 seconds, and refuses an expired one", async () => {
		await request(server)
			.post("/api/tenant/resend")
			.send({ email: owner })
			.expect(429);

		await registryQuery(
			"UPDATE tenant_code SET sent_at = now() - interval '2 minutes' WHERE email = $1",
			[owner],
		);
		const before = outbox.length;
		await request(server)
			.post("/api/tenant/resend")
			.send({ email: owner })
			.expect(200);
		expect(outbox.length).toBe(before + 1);

		await registryQuery(
			"UPDATE tenant_code SET expires_at = now() - interval '1 minute' WHERE email = $1",
			[owner],
		);
		const expired = await request(server)
			.post("/api/tenant/verify")
			.send({ email: owner, code: codeIn(outbox.at(-1) as Mail) });
		expect(expired.status).toBe(400);
		expect(expired.body.code).toBe("CODE_EXPIRED");
	});

	it("activates the workspace with the right code and signs in with the password", async () => {
		await registryQuery(
			"UPDATE tenant_code SET sent_at = now() - interval '2 minutes' WHERE email = $1",
			[owner],
		);
		await request(server)
			.post("/api/tenant/resend")
			.send({ email: owner })
			.expect(200);
		const code = codeIn(outbox.at(-1) as Mail);

		const verified = await request(server)
			.post("/api/tenant/verify")
			.send({ email: owner, code });
		expect(verified.status).toBe(200);
		expect(verified.body).toEqual({ tenantId });

		forgetTenants();
		const activated = await tenantById(tenantId);
		expect(activated?.status).toBe("active");
		expect(activated?.allowList).toEqual([`codeco-${runId}.example`, owner]);

		const again = await request(server)
			.post("/api/tenant/verify")
			.send({ email: owner, code });
		expect(again.body.code).toBe("CODE_INVALID");

		const lookup = await request(server)
			.post("/api/tenant/lookup")
			.send({ email: owner })
			.expect(200);
		expect(lookup.body.signIn).toContain("email");

		await request(server)
			.post("/api/auth/sign-in/email")
			.set("cookie", cookieOf(verified))
			.send({ email: owner, password })
			.expect(200);
	}, 60_000);

	it("names email as a sign-in method only for a person with a password", async () => {
		const lookup = await request(server)
			.post("/api/tenant/lookup")
			.send({ email: `rep@${TEST_TENANTS.a.domain}` })
			.expect(200);
		expect(lookup.body.signIn).not.toContain("email");
	});

	it("resets the password with a mailed code and answers unknown addresses alike", async () => {
		const before = outbox.length;
		const unknown = await request(server)
			.post("/api/tenant/reset")
			.send({ email: `nobody-${runId}@nowhere.example`, locale: "de" });
		expect(unknown.status).toBe(200);
		expect(unknown.body).toEqual({ ok: true });
		expect(outbox.length).toBe(before);

		const known = await request(server)
			.post("/api/tenant/reset")
			.send({ email: owner, locale: "de" });
		expect(known.status).toBe(200);
		expect(known.body).toEqual({ ok: true });
		expect(outbox.length).toBe(before + 1);
		const mail = outbox.at(-1) as Mail;
		expect(mail.text).toContain("neues Passwort");

		const confirmed = await request(server)
			.post("/api/tenant/reset/confirm")
			.send({ email: owner, code: codeIn(mail), password: newPassword });
		expect(confirmed.status).toBe(200);

		const lookup = await request(server)
			.post("/api/tenant/lookup")
			.send({ email: owner });
		const old = await request(server)
			.post("/api/auth/sign-in/email")
			.set("cookie", cookieOf(lookup))
			.send({ email: owner, password });
		expect(old.status).toBe(401);
		await request(server)
			.post("/api/auth/sign-in/email")
			.set("cookie", cookieOf(lookup))
			.send({ email: owner, password: newPassword })
			.expect(200);
	}, 60_000);
});
