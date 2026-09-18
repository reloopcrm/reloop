import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { API_KEY_HEADER } from "@crm/auth";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) process.env[key] = value;
};

fallback(
	"DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
);
fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");
fallback("ALLOWED_SIGN_IN", "example.com");
fallback("GOOGLE_CLIENT_ID", "test-google-client-id");
fallback("GOOGLE_CLIENT_SECRET", "test-google-client-secret");

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `export-route-${suffix}`;
const email = `${userId}@example.com`;

describe("the export route", () => {
	let app: INestApplication;
	let apiKey = "";
	let companyId = "";

	beforeAll(async () => {
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
	});

	afterAll(async () => {
		const { db } = await import("@crm/db");
		await db.deal.deleteMany({ where: { companyId } });
		await db.company.deleteMany({ where: { id: companyId } });
		await db.apikey.deleteMany({ where: { referenceId: userId } });
		await db.session.deleteMany({ where: { userId } });
		await db.account.deleteMany({ where: { userId } });
		await db.member.deleteMany({ where: { userId } });
		await db.user.deleteMany({ where: { id: userId } });
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
			.get("/api/exports/contacts?locale=fr")
			.set(API_KEY_HEADER, apiKey)
			.expect(400);
	});

	it("refuses a filter that is not the list's own shape", async () => {
		await request(app.getHttpServer())
			.get("/api/exports/contacts?filter=%7B%22page%22%3A%22soon%22%7D")
			.set(API_KEY_HEADER, apiKey)
			.expect(400);
	});
});
