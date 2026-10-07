import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { API_KEY_HEADER } from "@crm/auth";
import { testDatabaseUrl } from "@crm/db/test-database";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) process.env[key] = value;
};

process.env.DATABASE_URL = testDatabaseUrl(process.env);
fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");
fallback("ALLOWED_SIGN_IN", "example.com");
fallback("GOOGLE_CLIENT_ID", "test-google-client-id");
fallback("GOOGLE_CLIENT_SECRET", "test-google-client-secret");

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `export-route-${suffix}`;
const email = `${userId}@example.com`;
const revokedId = `export-revoked-${suffix}`;
const revokedEmail = `${revokedId}@revoked.example`;
const password = "ein-sehr-langes-passwort-zum-exportieren";
const entities = ["contacts", "companies", "deals"] as const;

describe("the export route", () => {
	let app: INestApplication;
	let apiKey = "";
	let companyId = "";
	let cookie = "";
	let revokedCookie = "";
	let revokedKey = "";
	let attachmentId = "";
	let revokedAttachmentId = "";
	const conversationIds: string[] = [];

	async function signIn(address: string) {
		const { auth } = await import("@crm/auth");
		const { headers } = await auth.api.signInEmail({
			body: { email: address, password },
			returnHeaders: true,
		});
		return headers.getSetCookie().join("; ");
	}

	async function attachmentOf(ownerId: string) {
		const { db } = await import("@crm/db");
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId: ownerId, title: "Export guard" },
			select: { id: true },
		});
		conversationIds.push(conversation.id);
		const submission = await db.agentConversationSubmission.create({
			data: {
				conversationId: conversation.id,
				submittedById: ownerId,
				clientRequestId: crypto.randomUUID(),
				message: { text: "Attached", resources: [], attachments: [] },
				attachments: {
					create: {
						name: "note.txt",
						mediaType: "text/plain",
						size: 4,
						content: Buffer.from("note"),
						position: 0,
					},
				},
			},
			select: { attachments: { select: { id: true } } },
		});
		return submission.attachments[0]?.id ?? "";
	}

	beforeAll(async () => {
		const { BackfillService } = await import(
			"../src/backfill/backfill.service"
		);
		spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
			() => {},
		);

		const { AppModule } = await import("../src/app.module");
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication({ bodyParser: false });
		await app.init();

		const { db } = await import("@crm/db");
		const { auth } = await import("@crm/auth");

		await db.user.create({
			data: {
				id: userId,
				email,
				name: "Export Rep",
				emailVerified: true,
				updatedAt: new Date(),
			},
		});

		const company = await db.company.create({
			data: { name: `Export Route ${suffix}`, domain: `route-${suffix}.test` },
		});
		companyId = company.id;

		await db.deal.create({
			data: {
				name: `Gewonnenes Geschäft ${suffix}`,
				companyId,
				ownerId: userId,
				stage: "CLOSED_WON",
			},
		});

		const created = await auth.api.createApiKey({
			body: { name: `export-route-${suffix}`, userId },
		});

		apiKey = created.key;

		const { grantSignIn, setPasswordFor } = await import("@crm/auth");

		await db.user.create({
			data: {
				id: revokedId,
				email: revokedEmail,
				name: "Revoked Rep",
				emailVerified: true,
				updatedAt: new Date(),
			},
		});
		expect(await grantSignIn(db, revokedEmail, "owner")).toBe(true);
		await setPasswordFor(userId, password);
		await setPasswordFor(revokedId, password);

		cookie = await signIn(email);
		revokedCookie = await signIn(revokedEmail);
		revokedKey = (
			await auth.api.createApiKey({
				body: { name: `export-revoked-${suffix}`, userId: revokedId },
			})
		).key;
		attachmentId = await attachmentOf(userId);
		revokedAttachmentId = await attachmentOf(revokedId);

		const { readSignInGrants } = await import("@crm/auth");
		const { SETTINGS_ID } = await import("@crm/db/settings");
		const granted = await readSignInGrants(db);
		expect(granted).toContain(revokedEmail);
		await db.appSetting.update({
			where: { id: SETTINGS_ID },
			data: {
				signInAddresses: granted.filter((entry) => entry !== revokedEmail),
			},
		});
	});

	afterAll(async () => {
		const { db } = await import("@crm/db");
		const { revokeSignIn } = await import("@crm/auth");
		const people = [userId, revokedId];
		await revokeSignIn(db, revokedEmail);
		await db.agentConversation.deleteMany({
			where: { id: { in: conversationIds } },
		});
		await db.deal.deleteMany({ where: { companyId } });
		await db.company.deleteMany({ where: { id: companyId } });
		await db.apikey.deleteMany({ where: { referenceId: { in: people } } });
		await db.session.deleteMany({ where: { userId: { in: people } } });
		await db.account.deleteMany({ where: { userId: { in: people } } });
		await db.member.deleteMany({ where: { userId: { in: people } } });
		await db.user.deleteMany({ where: { id: { in: people } } });
		await app.close();
	});

	it("refuses a caller with no session", async () => {
		await request(app.getHttpServer()).get("/api/exports/contacts").expect(401);
	});

	it("answers the guard before it says which lists exist", async () => {
		await request(app.getHttpServer()).get("/api/exports/invoices").expect(401);
	});

	it("hands an API key a CSV the browser downloads", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/exports/contacts")
			.set(API_KEY_HEADER, apiKey)
			.expect(200);

		expect(response.headers["content-type"]).toContain("text/csv");
		expect(response.headers["content-disposition"]).toContain("attachment");
		expect(response.headers["content-disposition"]).toContain("contacts-");
		expect(response.text.startsWith("\ufeffFirst name;Last name;Email;")).toBe(
			true,
		);
	});

	it("writes German headers and a German file name for a German session", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/exports/contacts?locale=de")
			.set(API_KEY_HEADER, apiKey)
			.expect(200);

		expect(response.headers["content-disposition"]).toContain("kontakte-");
		expect(response.text.startsWith("\ufeffVorname;Nachname;E-Mail;")).toBe(
			true,
		);
	});

	it("writes a German stage in the cell, not only in the header", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/exports/deals?locale=de")
			.set(API_KEY_HEADER, apiKey)
			.expect(200);

		const [header] = response.text.split("\r\n");

		expect(header).toContain("Phase");
		expect(header).not.toContain("Stage");
		expect(response.text).toContain("Gewonnen");
		expect(response.text).not.toContain("Closed won");
	});

	it("refuses a language nobody ships", async () => {
		await request(app.getHttpServer())
			.get("/api/exports/contacts?locale=kl")
			.set(API_KEY_HEADER, apiKey)
			.expect(400);
	});

	it("refuses a filter that is not the list's own shape", async () => {
		await request(app.getHttpServer())
			.get("/api/exports/contacts?filter=%7B%22page%22%3A%22soon%22%7D")
			.set(API_KEY_HEADER, apiKey)
			.expect(400);
	});

	it("hands a signed-in person on the allow-list every export and their attachment", async () => {
		for (const entity of entities) {
			await request(app.getHttpServer())
				.get(`/api/exports/${entity}`)
				.set("Cookie", cookie)
				.expect(200);
		}

		const response = await request(app.getHttpServer())
			.get(`/api/conversations/attachments/${attachmentId}`)
			.set("Cookie", cookie)
			.expect(200);

		expect(response.headers["content-disposition"]).toContain("note.txt");
	});

	it("refuses every export to a live session whose address was revoked", async () => {
		for (const entity of entities) {
			await request(app.getHttpServer())
				.get(`/api/exports/${entity}`)
				.set("Cookie", revokedCookie)
				.expect(403);
		}
	});

	it("refuses every export to an API key whose owner was revoked", async () => {
		for (const entity of entities) {
			await request(app.getHttpServer())
				.get(`/api/exports/${entity}`)
				.set(API_KEY_HEADER, revokedKey)
				.expect(403);
		}
	});

	it("refuses a revoked API key before it says which lists exist", async () => {
		await request(app.getHttpServer())
			.get("/api/exports/invoices")
			.set(API_KEY_HEADER, revokedKey)
			.expect(403);
	});

	it("refuses a revoked session its own attachment and its profile", async () => {
		await request(app.getHttpServer())
			.get(`/api/conversations/attachments/${revokedAttachmentId}`)
			.set("Cookie", revokedCookie)
			.expect(403);
		await request(app.getHttpServer())
			.get("/auth/me")
			.set("Cookie", revokedCookie)
			.expect(403);
	});

	it("refuses a revoked API key its owner's attachment and profile", async () => {
		await request(app.getHttpServer())
			.get(`/api/conversations/attachments/${revokedAttachmentId}`)
			.set(API_KEY_HEADER, revokedKey)
			.expect(403);
		await request(app.getHttpServer())
			.get("/auth/me")
			.set(API_KEY_HEADER, revokedKey)
			.expect(403);
	});
});
