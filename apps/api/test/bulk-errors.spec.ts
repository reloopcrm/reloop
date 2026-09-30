import { describe, expect, it } from "bun:test";
import { Prisma } from "@crm/db";
import { CONTACT_LIMIT_MESSAGE } from "@crm/db/plans";
import { runBulk } from "../src/crm/bulk";

describe("a bulk action at the contact limit", () => {
	it("reports the plain limit message, not the database text", async () => {
		const result = await runBulk(["one", "two"], async (id) => {
			if (id === "one") return id;
			throw new Prisma.PrismaClientUnknownRequestError(
				`Invalid \`prisma.contact.updateMany()\` invocation: ${CONTACT_LIMIT_MESSAGE}`,
				{ clientVersion: Prisma.prismaVersion.client },
			);
		});

		expect(result).toEqual({
			requested: 2,
			succeeded: 1,
			skipped: 0,
			failed: 1,
			message: CONTACT_LIMIT_MESSAGE,
		});
	});

	it("keeps other error messages as they are", async () => {
		const result = await runBulk(["one"], async () => {
			throw new Error("That owner does not work here any more.");
		});

		expect(result.message).toBe("That owner does not work here any more.");
	});
});
