import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
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

async function forgetRateLimit() {
	const { db } = await import("@crm/db");
	await db.rateLimit.deleteMany({});
}

describe("Auth (e2e)", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { AppModule } = await import("../src/app.module");

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication({ bodyParser: false });
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("rejects an unauthenticated request to a guarded route", async () => {
		await request(app.getHttpServer()).get("/auth/me").expect(401);
	});

	it("allows an unauthenticated request to an optional-auth route", async () => {
		const response = await request(app.getHttpServer())
			.get("/auth/session")
			.expect(200);

		expect(response.body).toEqual({ authenticated: false, user: null });
	});

	it("mounts the Better Auth handler", async () => {
		const response = await request(app.getHttpServer()).get("/api/auth/ok");

		expect(response.status).not.toBe(404);
	});

	it("lets the sign-in page read what it may offer", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/trpc/sso.signInOptions")
			.expect(200);

		const {
			isGoogleConfigured,
			isMicrosoftConfigured,
			isPasswordSignInConfigured,
		} = await import("@crm/auth");

		expect(response.body.result.data).toEqual({
			google: isGoogleConfigured(),
			microsoft: isMicrosoftConfigured(),
			password: isPasswordSignInConfigured(),
			providers: [],
		});
	});

	it("keeps the SSO configuration itself behind the session", async () => {
		const response = await request(app.getHttpServer()).get(
			"/api/trpc/sso.settings",
		);

		expect(response.status).toBe(401);
	});

	async function clean(id: string) {
		const { db } = await import("@crm/db");
		await db.session.deleteMany({ where: { userId: id } });
		await db.account.deleteMany({ where: { userId: id } });
		await db.member.deleteMany({ where: { userId: id } });
		await db.user.deleteMany({ where: { id } });
	}

	describe("signing in with an email address and a password", () => {
		beforeEach(forgetRateLimit);

		const email = `passwort-${process.env.TEST_RUN_ID ?? "spec"}@example.com`;
		const secret = "ein-sehr-langes-passwort";
		let userId: string;

		beforeAll(async () => {
			const { db } = await import("@crm/db");
			const { auth } = await import("@crm/auth");

			userId = `pw-user-${process.env.TEST_RUN_ID ?? "spec"}`;
			await clean(userId);
			await db.user.create({
				data: {
					id: userId,
					email,
					name: "Passwort Person",
					emailVerified: true,
					updatedAt: new Date(),
				},
			});

			const context = await auth.$context;
			await db.account.create({
				data: {
					id: `credential-${userId}`,
					accountId: userId,
					providerId: "credential",
					userId,
					password: await context.password.hash(secret),
					updatedAt: new Date(),
				},
			});
		});

		afterAll(async () => {
			await clean(userId);
		});

		it("offers the password form to the sign-in page", async () => {
			const response = await request(app.getHttpServer())
				.get("/api/trpc/sso.signInOptions")
				.expect(200);

			expect(response.body.result.data.password).toBe(true);
		});

		it("hands out a session for the right password", async () => {
			const response = await request(app.getHttpServer())
				.post("/api/auth/sign-in/email")
				.send({ email, password: secret })
				.expect(200);

			expect(response.body.user?.email).toBe(email);
			expect(String(response.headers["set-cookie"])).toContain("session_token");
		});

		it("refuses the wrong password", async () => {
			const response = await request(app.getHttpServer())
				.post("/api/auth/sign-in/email")
				.send({ email, password: "ein-falsches-passwort" });

			expect(response.status).toBeGreaterThanOrEqual(400);
			expect(response.headers["set-cookie"]).toBeUndefined();
		});

		it("refuses to register somebody new", async () => {
			const response = await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.send({
					email: `fremd-${email}`,
					password: secret,
					name: "Fremde Person",
				});

			expect(response.status).toBeGreaterThanOrEqual(400);

			const { db } = await import("@crm/db");
			expect(await db.user.count({ where: { email: `fremd-${email}` } })).toBe(
				0,
			);
		});
	});
});

describe("setting a password from the settings page", () => {
	beforeEach(forgetRateLimit);

	const email = `formular-${process.env.TEST_RUN_ID ?? "spec"}@example.com`;
	const userId = `form-user-${process.env.TEST_RUN_ID ?? "spec"}`;
	const first = "erstes-langes-passwort";
	const second = "zweites-langes-passwort";
	let app: INestApplication;
	let cookie: string;

	beforeAll(async () => {
		const { db } = await import("@crm/db");
		const { setPasswordFor } = await import("@crm/auth");
		const { AppModule } = await import("../src/app.module");

		await db.session.deleteMany({ where: { userId } });
		await db.account.deleteMany({ where: { userId } });
		await db.member.deleteMany({ where: { userId } });
		await db.user.deleteMany({ where: { id: userId } });

		await db.user.create({
			data: {
				id: userId,
				email,
				name: "Formular Person",
				emailVerified: true,
				updatedAt: new Date(),
			},
		});
		await setPasswordFor(userId, first);
		await forgetRateLimit();

		const fixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();
		app = fixture.createNestApplication({ bodyParser: false });
		await app.init();

		const signIn = await request(app.getHttpServer())
			.post("/api/auth/sign-in/email")
			.send({ email, password: first })
			.expect(200);

		cookie = String(signIn.headers["set-cookie"]);
	});

	afterAll(async () => {
		const { db } = await import("@crm/db");
		await db.session.deleteMany({ where: { userId } });
		await db.account.deleteMany({ where: { userId } });
		await db.member.deleteMany({ where: { userId } });
		await db.user.deleteMany({ where: { id: userId } });
		await app.close();
	});

	it("reports that a password is set", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/trpc/settings.passwordSignIn")
			.set("Cookie", cookie)
			.expect(200);

		expect(response.body.result.data).toMatchObject({
			enabled: true,
			set: true,
		});
	});

	it("replaces the password and lets the new one in", async () => {
		await request(app.getHttpServer())
			.post("/api/trpc/settings.setPassword")
			.set("Cookie", cookie)
			.send({ newPassword: second })
			.expect(200);

		await forgetRateLimit();
		await request(app.getHttpServer())
			.post("/api/auth/sign-in/email")
			.send({ email, password: second })
			.expect(200);

		await forgetRateLimit();
		const stale = await request(app.getHttpServer())
			.post("/api/auth/sign-in/email")
			.send({ email, password: first });

		expect(stale.status).toBe(401);
	});

	it("refuses a password that is too short", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/trpc/settings.setPassword")
			.set("Cookie", cookie)
			.send({ newPassword: "kurz" });

		expect(response.status).toBeGreaterThanOrEqual(400);
	});

	it("refuses a signed-out caller", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/trpc/settings.setPassword")
			.send({ newPassword: "ein-drittes-langes-passwort" });

		expect(response.status).toBeGreaterThanOrEqual(400);
	});
});
