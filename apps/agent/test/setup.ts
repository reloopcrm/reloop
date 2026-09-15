import "@crm/env/load";
import { afterAll } from "bun:test";

const test = process.env.TEST_DATABASE_URL;
if (test) process.env.DATABASE_URL = test;

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	const { db } = await import("@crm/db");
	await db.$disconnect();
});
