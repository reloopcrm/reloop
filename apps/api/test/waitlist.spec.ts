import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { waitlistJoinInput } from "@crm/validation/waitlist";
import { ForbiddenException } from "@nestjs/common";
import type { TrackingCounterService } from "../src/tracking/tracking-counter.service";
import { WaitlistService } from "../src/waitlist/waitlist.service";
import { WAITLIST } from "../src/waitlist/waitlist-config";

type Row = { id: string; email: string; createdAt: Date };

function service({ role = "owner" } = {}) {
	const rows: Row[] = [];
	const used = new Map<string, number>();

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
		take: async (key: string, limit: number) => {
			const next = (used.get(key) ?? 0) + 1;
			if (next > limit) return false;
			used.set(key, next);
			return true;
		},
	} as unknown as TrackingCounterService;

	return { waitlist: new WaitlistService(db, counters), rows };
}

describe("joining the waitlist", () => {
	it("stores the address right away", async () => {
		const { waitlist, rows } = service();

		await waitlist.join("ada@example.com", "203.0.113.5");

		expect(rows).toHaveLength(1);
		expect(rows[0]?.email).toBe("ada@example.com");
	});

	it("keeps one row for the same address", async () => {
		const { waitlist, rows } = service();

		await waitlist.join("ada@example.com", "203.0.113.5");
		await waitlist.join("ada@example.com", "203.0.113.5");

		expect(rows).toHaveLength(1);
	});

	it("answers a refusal instead of ok once the caller is over the limit", async () => {
		const { waitlist, rows } = service();
		const flooder = "198.51.100.7";

		for (let sent = 0; sent < WAITLIST.join.perAddressPerMinute; sent += 1) {
			await waitlist.join(`spam${sent}@example.com`, flooder);
		}

		await expect(
			waitlist.join("one-too-many@example.com", flooder),
		).rejects.toThrow("Too many sign-ups");

		expect(rows).toHaveLength(WAITLIST.join.perAddressPerMinute);
	});

	it("keeps taking sign-ups from every other address while one floods", async () => {
		const { waitlist, rows } = service();
		const flooder = "198.51.100.7";

		for (let sent = 0; sent <= WAITLIST.join.perAddressPerMinute; sent += 1) {
			await waitlist
				.join(`spam${sent}@example.com`, flooder)
				.catch(() => undefined);
		}

		await waitlist.join("ada@example.com", "203.0.113.5");

		expect(rows.some((row) => row.email === "ada@example.com")).toBe(true);
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
		await waitlist.join("ada@example.com", "203.0.113.5");

		const { rows } = await waitlist.list("u1");

		expect(rows[0]?.email).toBe("ada@example.com");
		expect(Number.isNaN(Date.parse(rows[0]?.createdAt ?? ""))).toBe(false);
	});

	it("blocks a spreadsheet formula in the CSV export", async () => {
		const { waitlist } = service();
		await waitlist.join("=cmd@example.com", "203.0.113.5");

		const { csv } = await waitlist.list("u1");

		expect(csv.split("\n")[0]).toBe("email,created_at");
		expect(csv).toContain(`"'=cmd@example.com"`);
	});
});
