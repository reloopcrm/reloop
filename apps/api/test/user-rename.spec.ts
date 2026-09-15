import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AuthService } from "../src/auth/auth.service";
import { UsersService } from "../src/users/users.service";

const suffix = process.env.TEST_RUN_ID ?? "rename-spec";
const userId = `rename-${suffix}`;

let invalidated: string[] = [];

const auth = {
	invalidateProfile: async (id: string) => {
		invalidated.push(id);
	},
} as unknown as AuthService;

const users = new UsersService(db, auth);

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "jonasmueller42",
			email: `${userId}@example.test`,
			emailVerified: true,
		},
	});
});

afterAll(async () => {
	await db.user.deleteMany({ where: { id: userId } });
});

describe("renaming yourself", () => {
	it("saves the tidied name and forgets the cached profile", async () => {
		invalidated = [];

		const saved = await users.rename(userId, "  Jonas   Müller  ");

		expect(saved.name).toBe("Jonas Müller");
		expect(invalidated).toEqual([userId]);

		const row = await db.user.findUniqueOrThrow({
			where: { id: userId },
			select: { name: true },
		});
		expect(row.name).toBe("Jonas Müller");
	});

	it("refuses an empty name", async () => {
		expect(users.rename(userId, "   ")).rejects.toThrow(
			"Enter the name people should see.",
		);
	});

	it("refuses a name nobody could read", async () => {
		expect(users.rename(userId, "x".repeat(81))).rejects.toThrow(
			"at most 80 characters",
		);
	});
});
