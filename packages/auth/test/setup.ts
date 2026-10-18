import "@crm/env/load";
import { afterAll } from "bun:test";
import { testDatabaseUrl } from "@crm/db/test-database";

process.env.DATABASE_URL = testDatabaseUrl(process.env);

process.env.API_URL = "https://crm.example.test";
process.env.CRM_TELEMETRY_DISABLED = "1";
process.env.PASSWORD_SIGN_IN = "1";

afterAll(async () => {
	const { db } = await import("@crm/db");
	await db.$disconnect();
});
