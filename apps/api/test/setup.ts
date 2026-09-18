import "./classic-decorators";
import "@crm/env/load";
import { afterAll } from "bun:test";
import { testDatabaseUrl } from "@crm/db/test-database";

process.env.DATABASE_URL = testDatabaseUrl(process.env);

process.env.CRM_TELEMETRY_DISABLED = "1";
process.env.PASSWORD_SIGN_IN = "1";
process.env.ALLOWED_SIGN_IN = "example.com";

afterAll(async () => {
	const { db } = await import("@crm/db");
	await db.$disconnect();
});
