import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SignInAllowedGuard } from "../src/auth/sign-in-allowed.guard";
import { ExportsController } from "../src/exports/exports.controller";
import { ExportsService } from "../src/exports/exports.service";
import { EXPORTS } from "../src/exports/exports-config";

async function* failingOnSecondPage(): AsyncGenerator<string> {
	yield `${EXPORTS.csv.bom}Name\n`;
	yield "Acme\n";
	throw new Error("database went away");
}

async function* complete(): AsyncGenerator<string> {
	yield `${EXPORTS.csv.bom}Name\n`;
	yield "Acme\n";
}

describe("a CSV download that fails after it started", () => {
	let app: INestApplication;
	let lines: () => AsyncGenerator<string> = complete;

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [ExportsController],
			providers: [
				{
					provide: ExportsService,
					useValue: {
						file: async () => ({ filename: "x.csv", lines: lines() }),
					},
				},
			],
		})
			.overrideGuard(SignInAllowedGuard)
			.useValue({ canActivate: () => true })
			.compile();

		app = module.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("delivers a complete file when nothing fails", async () => {
		lines = complete;
		const response = await request(app.getHttpServer())
			.get("/api/exports/contacts")
			.buffer(true)
			.parse((res, done) => {
				let body = "";
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () => done(null, body));
			});

		expect(response.status).toBe(200);
		expect(response.body).toContain("Acme");
	});

	it("ends the response with an error instead of a clean short file", async () => {
		lines = failingOnSecondPage;
		let failure: Error | null = null;
		let status = 0;

		try {
			const response = await request(app.getHttpServer())
				.get("/api/exports/contacts")
				.buffer(true)
				.parse((res, done) => {
					let body = "";
					res.on("data", (chunk) => {
						body += chunk;
					});
					res.on("end", () => done(null, body));
					res.on("error", (error) => done(error, ""));
					res.on("aborted", () => done(new Error("aborted"), ""));
				});
			status = response.status;
		} catch (cause) {
			failure = cause instanceof Error ? cause : new Error(String(cause));
		}

		expect(status === 0 || status >= 500).toBe(true);
		expect(failure ?? status).not.toBe(200);
	});
});
