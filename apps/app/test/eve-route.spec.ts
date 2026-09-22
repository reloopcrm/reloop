import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { db } from "@crm/db";

const suffix = process.env.TEST_RUN_ID ?? "eve-route-spec";
const owner = `eve-route-owner-${suffix}`;
const stranger = `eve-route-stranger-${suffix}`;
const ownedSession = `ses_${suffix}_owned`;
const orphanSession = `ses_${suffix}_orphan`;
const mintedSession = `ses_${suffix}_minted`;

let signedIn = owner;
let upstreamCalls: string[] = [];
let upstream: () => Response = () => Response.json({ ok: true });
let contactId: string;
let handler: (request: Request) => Promise<Response>;

const realFetch = globalThis.fetch;
const session = { ...(await import("@/lib/session")) };

beforeAll(async () => {
	process.env.AGENT_BRIDGE_SECRET = "eve-route-spec-secret";
	process.env.AGENT_URL = "http://agent.test";

	const nextServer = await import("next/server");
	mock.module("next/server", () => ({
		...nextServer,
		connection: async () => {},
	}));
	mock.module("@/lib/session", () => ({
		...session,
		getSession: async () => ({
			user: { id: signedIn, email: `${signedIn}@example.test`, name: signedIn },
		}),
	}));
	globalThis.fetch = (async (input: string | URL | Request) => {
		upstreamCalls.push(String(input));
		return upstream();
	}) as typeof fetch;

	({ GET: handler } = await import("../app/eve/v1/[...path]/route"));

	await cleanup();
	for (const id of [owner, stranger]) {
		await db.user.create({
			data: { id, name: id, email: `${id}@example.test` },
		});
	}
	const contact = await db.contact.create({
		data: {
			firstName: "Eve",
			lastName: "Route",
			email: `${suffix}@example.test`,
		},
		select: { id: true },
	});
	contactId = contact.id;
	await db.agentConversation.create({
		data: { sessionId: ownedSession, userId: owner, contactId },
	});
});

afterAll(async () => {
	globalThis.fetch = realFetch;
	mock.module("@/lib/session", () => session);
	await cleanup();
});

async function cleanup() {
	await db.agentConversation.deleteMany({
		where: { userId: { in: [owner, stranger] } },
	});
	await db.contact.deleteMany({ where: { email: `${suffix}@example.test` } });
	await db.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
}

function call(path: string, init?: RequestInit) {
	upstreamCalls = [];
	return handler(new Request(`http://app.test${path}`, init));
}

describe("eve bridge route", () => {
	it("refuses a session that has no conversation row", async () => {
		signedIn = owner;
		const response = await call(`/eve/v1/session/${orphanSession}/stream`);

		expect(response.status).toBe(404);
		expect(upstreamCalls).toEqual([]);
	});

	it("refuses another user's conversation with the same answer", async () => {
		signedIn = stranger;
		const foreign = await call(`/eve/v1/session/${ownedSession}/stream`);
		signedIn = owner;
		const missing = await call(`/eve/v1/session/${orphanSession}/stream`);

		expect(foreign.status).toBe(404);
		expect(upstreamCalls).toEqual([]);
		expect(await foreign.json()).toEqual(await missing.json());
	});

	it("lets the owner read their transcript", async () => {
		signedIn = owner;
		upstream = () => new Response("event-stream", { status: 200 });
		const response = await call(`/eve/v1/session/${ownedSession}/stream`);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("event-stream");
		expect(upstreamCalls).toEqual([
			`http://agent.test/eve/v1/session/${ownedSession}/stream`,
		]);
	});

	it("claims a new session for the caller before the client can stream it", async () => {
		signedIn = owner;
		upstream = () => Response.json({ sessionId: mintedSession });
		const response = await call("/eve/v1/session", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-crm-contact": contactId,
			},
			body: JSON.stringify({ message: "  Who is this person?  " }),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ sessionId: mintedSession });
		expect(
			await db.agentConversation.findUnique({
				where: { sessionId: mintedSession },
				select: { userId: true, contactId: true, kind: true, title: true },
			}),
		).toEqual({
			userId: owner,
			contactId,
			kind: "RECORD",
			title: "Who is this person?",
		});

		signedIn = stranger;
		const foreign = await call(`/eve/v1/session/${mintedSession}/stream`);
		expect(foreign.status).toBe(404);
	});

	it("does not treat the reset route as a session id", async () => {
		signedIn = owner;
		upstream = () => Response.json({ status: "no_active_session" });
		const response = await call("/eve/v1/session/reset", { method: "POST" });

		expect(response.status).toBe(200);
		expect(upstreamCalls).toEqual(["http://agent.test/eve/v1/session/reset"]);
	});
});
