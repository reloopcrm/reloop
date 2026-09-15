import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { waitlistJoinInput } from "@crm/validation/waitlist";
import { ForbiddenException } from "@nestjs/common";
import type { TrackingCounterService } from "../src/tracking/tracking-counter.service";
import { hashToken, WaitlistService } from "../src/waitlist/waitlist.service";

type Row = {
	id: string;
	email: string;
	tokenHash: string;
	createdAt: Date;
	confirmedAt: Date | null;
};

const realFetch = globalThis.fetch;
const realKey = process.env.RESEND_API_KEY;
const realFrom = process.env.WAITLIST_FROM_EMAIL;

function restore(name: string, value: string | undefined) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

let sent: { url: string; body: { to: string[]; text: string } }[] = [];

beforeEach(() => {
	process.env.RESEND_API_KEY = "re_test";
	process.env.WAITLIST_FROM_EMAIL = "Reloop <waitlist@example.com>";
	sent = [];
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
		return new Response("{}", { status: 200 });
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	restore("RESEND_API_KEY", realKey);
	restore("WAITLIST_FROM_EMAIL", realFrom);
});

function service({ allow = true, role = "owner" } = {}) {
	const rows: Row[] = [];

	const db = {
		member: { findUnique: async () => (role ? { role } : null) },
		waitlistSignup: {
			findUnique: async ({
				where,
			}: {
				where: { email?: string; tokenHash?: string };
			}) =>
				rows.find(
					(row) =>
						row.email === where.email || row.tokenHash === where.tokenHash,
				) ?? null,
			upsert: async ({
				where,
				create,
				update,
			}: {
				where: { email: string };
				create: { email: string; tokenHash: string };
				update: { tokenHash: string; createdAt: Date };
			}) => {
				const row = rows.find((r) => r.email === where.email);
				if (row) return Object.assign(row, update);
				const created = {
					id: `id${rows.length}`,
					createdAt: new Date(),
					confirmedAt: null,
					...create,
				};
				rows.push(created);
				return created;
			},
			update: async ({
				where,
				data,
			}: {
				where: { id: string };
				data: { confirmedAt: Date };
			}) => Object.assign(rows.find((r) => r.id === where.id) ?? {}, data),
			findMany: async () => rows,
		},
	} as unknown as Db;

	const counters = {
		take: async () => allow,
	} as unknown as TrackingCounterService;

	return { waitlist: new WaitlistService(db, counters), rows };
}

function tokenOf(text: string): string {
	return new URL(text.match(/https?:\/\/\S+/)?.[0] ?? "").searchParams.get(
		"token",
	) as string;
}

describe("joining the waitlist", () => {
	it("stores a pending row with a hashed token and mails the raw one", async () => {
		const { waitlist, rows } = service();

		await waitlist.join("ada@example.com");

		expect(rows).toHaveLength(1);
		expect(rows[0]?.confirmedAt).toBeNull();
		expect(sent).toHaveLength(1);
		expect(sent[0]?.url).toBe("https://api.resend.com/emails");
		expect(sent[0]?.body.to).toEqual(["ada@example.com"]);
		const token = tokenOf(sent[0]?.body.text ?? "");
		expect(rows[0]?.tokenHash).toBe(hashToken(token));
		expect(rows[0]?.tokenHash).not.toBe(token);
	});

	it("does not mail again inside the resend window", async () => {
		const { waitlist } = service();

		await waitlist.join("ada@example.com");
		await waitlist.join("ada@example.com");

		expect(sent).toHaveLength(1);
	});

	it("stores and sends nothing without the Resend variables", async () => {
		delete process.env.RESEND_API_KEY;
		const { waitlist, rows } = service();

		await waitlist.join("ada@example.com");

		expect(waitlist.status()).toEqual({ open: false });
		expect(rows).toHaveLength(0);
		expect(sent).toHaveLength(0);
	});

	it("stores and sends nothing once the rate limit is reached", async () => {
		const { waitlist, rows } = service({ allow: false });

		await waitlist.join("ada@example.com");

		expect(rows).toHaveLength(0);
		expect(sent).toHaveLength(0);
	});

	it("does not throw when Resend is unreachable", async () => {
		globalThis.fetch = (async () => {
			throw new Error("connect ECONNREFUSED");
		}) as unknown as typeof fetch;
		const { waitlist } = service();

		expect(waitlist.join("ada@example.com")).resolves.toBeUndefined();
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

describe("confirming", () => {
	it("sets confirmedAt for the mailed token, and is idempotent", async () => {
		const { waitlist, rows } = service();
		await waitlist.join("ada@example.com");
		const token = tokenOf(sent[0]?.body.text ?? "");

		expect(await waitlist.confirm(token)).toEqual({ confirmed: true });
		expect(rows[0]?.confirmedAt).toBeInstanceOf(Date);
		expect(await waitlist.confirm(token)).toEqual({ confirmed: true });
	});

	it("refuses an unknown token", async () => {
		const { waitlist } = service();

		expect(await waitlist.confirm("x".repeat(43))).toEqual({
			confirmed: false,
		});
	});

	it("refuses a pending token older than its lifetime", async () => {
		const { waitlist, rows } = service();
		await waitlist.join("ada@example.com");
		if (rows[0]) rows[0].createdAt = new Date(0);

		expect(await waitlist.confirm(tokenOf(sent[0]?.body.text ?? ""))).toEqual({
			confirmed: false,
		});
		expect(rows[0]?.confirmedAt).toBeNull();
	});

	it("never mails a confirmed address again", async () => {
		const { waitlist, rows } = service();
		await waitlist.join("ada@example.com");
		await waitlist.confirm(tokenOf(sent[0]?.body.text ?? ""));
		if (rows[0]) rows[0].createdAt = new Date(0);

		await waitlist.join("ada@example.com");

		expect(sent).toHaveLength(1);
	});
});

describe("the list", () => {
	it("is for owners only", async () => {
		expect(service({ role: "admin" }).waitlist.list("u1")).rejects.toThrow(
			ForbiddenException,
		);
		expect(await service().waitlist.list("u1")).toEqual({ rows: [] });
	});
});
