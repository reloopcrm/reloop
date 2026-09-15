import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { waitlistJoinInput } from "@crm/validation/waitlist";
import { ForbiddenException } from "@nestjs/common";
import type { TrackingCounterService } from "../src/tracking/tracking-counter.service";
import { WaitlistService } from "../src/waitlist/waitlist.service";

type Row = { id: string; email: string; createdAt: Date };

function service({ allow = true, role = "owner" } = {}) {
	const rows: Row[] = [];

	const db = {
		member: { findUnique: async () => ({ role }) },
		waitlistSignup: {
			upsert: async ({
				where,
				create,
			}: {
				where: { email: string };
				create: { email: string };
			}) => {
				const found = rows.find((row) => row.email === where.email);
				if (found) return found;
				const created = {
					id: `id${rows.length}`,
					createdAt: new Date(),
					...create,
				};
				rows.push(created);
				return created;
			},
			findMany: async () => rows,
		},
	} as unknown as Db;

	const counters = {
		take: async () => allow,
	} as unknown as TrackingCounterService;

	return { waitlist: new WaitlistService(db, counters), rows };
}

describe("joining the waitlist", () => {
	it("stores the address right away", async () => {
		const { waitlist, rows } = service();

		await waitlist.join("ada@example.com");

		expect(rows).toHaveLength(1);
		expect(rows[0]?.email).toBe("ada@example.com");
	});

	it("keeps one row for the same address", async () => {
		const { waitlist, rows } = service();

		await waitlist.join("ada@example.com");
		await waitlist.join("ada@example.com");

		expect(rows).toHaveLength(1);
	});

	it("stores nothing once the rate limit is reached", async () => {
		const { waitlist, rows } = service({ allow: false });

		await waitlist.join("ada@example.com");

		expect(rows).toHaveLength(0);
	});

	it("normalises and validates the address at the boundary", () => {
		expect(waitlistJoinInput.parse({ email: " Ada@Example.COM " })).toEqual({
			email: "ada@example.com",
		});
		expect(waitlistJoinInput.safeParse({ email: "not an email" }).success).toBe(
			false,
		);
	});
});

describe("the list", () => {
	it("is for owners only", async () => {
		await expect(
			service({ role: "admin" }).waitlist.list("u1"),
		).rejects.toThrow(ForbiddenException);
		expect(await service().waitlist.list("u1")).toEqual({
			rows: [],
			csv: "email,created_at",
		});
	});

	it("shows the address and the signup date", async () => {
		const { waitlist } = service();
		await waitlist.join("ada@example.com");

		const { rows } = await waitlist.list("u1");

		expect(rows[0]?.email).toBe("ada@example.com");
		expect(Number.isNaN(Date.parse(rows[0]?.createdAt ?? ""))).toBe(false);
	});

	it("blocks a spreadsheet formula in the CSV export", async () => {
		const { waitlist } = service();
		await waitlist.join("=cmd@example.com");

		const { csv } = await waitlist.list("u1");

		expect(csv.split("\n")[0]).toBe("email,created_at");
		expect(csv).toContain(`"'=cmd@example.com"`);
	});
});
