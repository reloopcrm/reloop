import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import {
	API_KEY_HEADER,
	apiUrl,
	appUrl,
	auth,
	endAiClientAccessOf,
	MCP as MCP_AUTH,
	mcpUrl,
	setPasswordFor,
	WORKSPACE_ID,
} from "@crm/auth";
import { db } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { storeKeyOf } from "../src/http/rest-rate-limit.middleware";
import { MCP } from "../src/mcp/mcp.config";
import { MCP_TOOL_NAMES } from "../src/mcp/mcp-server";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const RUN = crypto.randomUUID().slice(0, 8);
const userId = `mcp-flow-${RUN}`;
const email = `preview-mcp-${RUN}@example.com`;
const password = `Preview-pass-${RUN}-long-enough`;
const companyId = `mcp-company-${RUN}`;
const contactId = `mcp-contact-${RUN}`;
const dealId = `mcp-deal-${RUN}`;
const threadId = `mcp-thread-${RUN}`;
const companyName = `Preview Pallets ${RUN}`;
const redirectUri = "https://client.example/callback";
const MCP_ACCEPT = "application/json, text/event-stream";

type App = Awaited<ReturnType<typeof createApp>>;

let app: App | undefined;
let server: ReturnType<App["getHttpServer"]>;
let apiKey = "";
let cookie = "";
let clientId = "";
const rateKeysBefore = new Set<string>();
const limitKeys: string[] = [];

async function fillWindow(storeKey: string) {
	limitKeys.push(storeKey);
	await db.rateLimit.upsert({
		where: { key: storeKey },
		create: {
			id: storeKey,
			key: storeKey,
			count: MCP.rateLimit.max,
			lastRequest: BigInt(Date.now()),
		},
		update: { count: MCP.rateLimit.max, lastRequest: BigInt(Date.now()) },
	});
}

type ToolArguments = {
	query?: string;
	id?: string;
	contactId?: string;
	threadId?: string;
	pageSize?: number;
};

type RpcParams = {
	protocolVersion?: string;
	capabilities?: Record<string, never>;
	clientInfo?: { name: string; version: string };
	name?: string;
	arguments?: ToolArguments;
};

type RpcRequest = {
	jsonrpc: "2.0";
	id: number;
	method: string;
	params: RpcParams;
};

function rpc(method: string, params: RpcParams = {}, id = 1): RpcRequest {
	return { jsonrpc: "2.0", id, method, params };
}

const initialize = rpc("initialize", {
	protocolVersion: "2025-06-18",
	capabilities: {},
	clientInfo: { name: "mcp-flow-spec", version: "1.0.0" },
});

function mcp(body: RpcRequest, headers: Record<string, string>) {
	const call = request(server)
		.post(MCP.path)
		.set("accept", MCP_ACCEPT)
		.set("content-type", "application/json");
	for (const [name, value] of Object.entries(headers)) call.set(name, value);
	return call.send(body);
}

function callTool(
	name: string,
	args: ToolArguments,
	headers: Record<string, string>,
) {
	return mcp(rpc("tools/call", { name, arguments: args }), headers);
}

function cookieOf(setCookie: string[] | string | undefined): string {
	const list = Array.isArray(setCookie)
		? setCookie
		: setCookie
			? [setCookie]
			: [];
	return list.map((entry) => entry.split(";")[0]).join("; ");
}

function pkce() {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

async function rateLimitKeys(): Promise<string[]> {
	const rows = await db.rateLimit.findMany({ select: { key: true } });
	return rows.map((row) => row.key);
}

const spies: { mockRestore: () => void }[] = [];

beforeAll(async () => {
	spies.push(
		spyOn(
			DispatchHeartbeatService.prototype,
			"onApplicationBootstrap",
		).mockImplementation(() => {}),
		spyOn(
			MailboxSyncHeartbeatService.prototype,
			"onApplicationBootstrap",
		).mockImplementation(() => {}),
		spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
			() => {},
		),
		spyOn(db, "$disconnect").mockResolvedValue(undefined),
	);

	for (const key of await rateLimitKeys()) rateKeysBefore.add(key);

	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.create({
		data: {
			id: userId,
			email,
			name: "MCP flow preview",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	await setPasswordFor(userId, password);

	await db.company.create({
		data: { id: companyId, name: companyName, domain: `mcp-${RUN}.example` },
	});
	await db.contact.create({
		data: {
			id: contactId,
			firstName: "Preview",
			lastName: `Buyer ${RUN}`,
			email: `buyer-${RUN}@example.com`,
			companyId,
			ownerId: userId,
		},
	});
	await db.deal.create({
		data: {
			id: dealId,
			name: `Preview order ${RUN}`,
			companyId,
			ownerId: userId,
			contacts: { create: { contactId, role: "buyer" } },
		},
	});
	const sentAt = new Date("2026-01-02T10:00:00.000Z");
	await db.emailThread.create({
		data: {
			id: threadId,
			rootMessageId: `<root-${RUN}@example.com>`,
			subject: "Preview pallets",
			firstMessageAt: sentAt,
			lastMessageAt: sentAt,
			companyId,
			messages: {
				create: {
					rfcMessageId: `<root-${RUN}@example.com>`,
					direction: "INBOUND",
					fromEmail: `buyer-${RUN}@example.com`,
					fromName: "Preview Buyer",
					recipients: [{ email, name: null, kind: "to" }],
					subject: "Preview pallets",
					body: "Do you still have the blue pallets?",
					summary: "Asks about blue pallets.",
					sentAt,
				},
			},
		},
	});

	apiKey = (
		await auth.api.createApiKey({
			body: { name: "mcp flow", userId, expiresIn: null },
		})
	).key;

	app = await createApp();
	server = app.getHttpServer();

	const signIn = await request(server)
		.post("/api/auth/sign-in/email")
		.set("origin", appUrl)
		.send({ email, password });
	expect(signIn.status).toBe(200);
	cookie = cookieOf(signIn.headers["set-cookie"]);
	expect(cookie.length).toBeGreaterThan(0);
});

afterAll(async () => {
	await app?.close();
	for (const spy of spies) spy.mockRestore();

	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ contactId },
				{ companyId },
				{ dealId },
				{ payload: { path: ["threadId"], equals: threadId } },
			],
		},
	});
	await db.emailMessage.deleteMany({ where: { threadId } });
	await db.emailThread.deleteMany({ where: { id: threadId } });
	await db.deal.deleteMany({ where: { id: dealId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	if (clientId) await db.oauthClient.deleteMany({ where: { clientId } });
	await db.apikey.deleteMany({ where: { referenceId: userId } });
	await db.user.deleteMany({ where: { id: userId } });
	const created = (await rateLimitKeys()).filter(
		(key) => !rateKeysBefore.has(key),
	);
	await db.rateLimit.deleteMany({
		where: { key: { in: [...created, ...limitKeys] } },
	});
});

describe("the MCP endpoint without a credential", () => {
	it("answers 401 with a challenge that names the protected resource metadata", async () => {
		const response = await mcp(initialize, {});

		expect(response.status).toBe(401);
		expect(response.headers["www-authenticate"]).toBe(
			`Bearer resource_metadata="${apiUrl.replace(/\/+$/, "")}/.well-known/oauth-protected-resource/api/mcp"`,
		);
		expect(response.headers["access-control-expose-headers"]).toBe(
			"WWW-Authenticate",
		);
		expect(response.body).toMatchObject({
			jsonrpc: "2.0",
			error: { code: -32000, message: "Unauthorized" },
		});
	});

	it("refuses a session cookie alone", async () => {
		const response = await mcp(initialize, { cookie });

		expect(response.status).toBe(401);
	});

	it("refuses an unknown bearer token and an unknown API key", async () => {
		const bearer = await mcp(initialize, { authorization: "Bearer nope" });
		const key = await mcp(initialize, { [API_KEY_HEADER]: "nope" });

		expect(bearer.status).toBe(401);
		expect(key.status).toBe(401);
	});

	it("answers a JSON-RPC parse error for a body that is not JSON", async () => {
		const response = await request(server)
			.post(MCP.path)
			.set("accept", MCP_ACCEPT)
			.set("content-type", "application/json")
			.set(API_KEY_HEADER, apiKey)
			.send("{not json");

		expect(response.status).toBe(400);
		expect(response.body.error).toEqual({
			code: -32700,
			message: "Parse error",
		});
	});

	it("answers 405 on GET and DELETE", async () => {
		expect((await request(server).get(MCP.path)).status).toBe(405);
		expect((await request(server).delete(MCP.path)).status).toBe(405);
	});
});

describe("the MCP endpoint with an API key", () => {
	const headers = () => ({ [API_KEY_HEADER]: apiKey });

	it("initializes and lists the seven read only tools", async () => {
		const init = await mcp(initialize, headers());
		expect(init.status).toBe(200);
		expect(init.body.result.serverInfo.name).toBe(MCP.server.name);

		const list = await mcp(rpc("tools/list", {}, 2), headers());
		expect(list.status).toBe(200);
		const tools: {
			name: string;
			annotations?: { readOnlyHint?: boolean };
			inputSchema: { properties?: object };
		}[] = list.body.result.tools;

		expect(tools.map((tool) => tool.name).sort()).toEqual(
			[...MCP_TOOL_NAMES].sort(),
		);
		for (const tool of tools) {
			expect(tool.annotations?.readOnlyHint).toBe(true);
			expect(Object.keys(tool.inputSchema.properties ?? {}).length).toBe(
				tool.name === "list_win_back_candidates" ? 5 : 1,
			);
		}
	});

	it("searches and answers in both the structured and the text form", async () => {
		const response = await callTool(
			"search",
			{ query: companyName },
			headers(),
		);
		expect(response.status).toBe(200);
		const result = response.body.result;

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent.results).toContainEqual({
			id: `company:${companyId}`,
			title: companyName,
			url: `${appUrl.replace(/\/+$/, "")}/companies/${companyId}`,
		});
		expect(JSON.parse(result.content[0].text)).toEqual(
			result.structuredContent,
		);
	});

	it("fetches a contact, a company and a deal", async () => {
		for (const id of [
			`contact:${contactId}`,
			`company:${companyId}`,
			`deal:${dealId}`,
		]) {
			const response = await callTool("fetch", { id }, headers());
			const result = response.body.result;

			expect(result.isError).toBeUndefined();
			expect(result.structuredContent.id).toBe(id);
			expect(result.structuredContent.text.length).toBeGreaterThan(0);
		}
	});

	it("turns an unknown record into a tool error, not a server error", async () => {
		const unknown = await callTool(
			"fetch",
			{ id: "contact:missing" },
			headers(),
		);
		expect(unknown.status).toBe(200);
		expect(unknown.body.result.isError).toBe(true);
		expect(unknown.body.result.content[0].text).toContain("No contact");

		const malformed = await callTool("fetch", { id: "nothing" }, headers());
		expect(malformed.body.result.isError).toBe(true);
	});

	it("reads a contact without mail, its empty mail list and its draft state", async () => {
		const contact = await callTool("get_contact", { contactId }, headers());
		expect(contact.body.result.isError).toBeUndefined();
		expect(contact.body.result.structuredContent).toMatchObject({
			id: contactId,
			name: `Preview Buyer ${RUN}`,
			company: { id: companyId, name: companyName },
			winBack: null,
		});
		expect(contact.body.result.structuredContent.deals).toHaveLength(1);

		const mails = await callTool("get_contact_mails", { contactId }, headers());
		expect(mails.body.result.structuredContent).toEqual({
			contactId,
			mailCount: 0,
			mails: [],
		});

		const draft = await callTool("get_contact_draft", { contactId }, headers());
		expect(draft.body.result.isError).toBeUndefined();
		expect(draft.body.result.structuredContent.draft).toBeNull();
	});

	it("reads a thread with its messages", async () => {
		const response = await callTool("get_thread", { threadId }, headers());
		const result = response.body.result;

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			id: threadId,
			subject: "Preview pallets",
			company: { id: companyId, name: companyName },
		});
		expect(result.structuredContent.messages).toEqual([
			expect.objectContaining({
				direction: "INBOUND",
				body: "Do you still have the blue pallets?",
				summary: "Asks about blue pallets.",
			}),
		]);

		const missing = await callTool(
			"get_thread",
			{ threadId: "missing" },
			headers(),
		);
		expect(missing.body.result.isError).toBe(true);
	});

	it("lists win back candidates with the page the caller asked for", async () => {
		const response = await callTool(
			"list_win_back_candidates",
			{ pageSize: 5 },
			headers(),
		);
		const result = response.body.result;

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent.pageSize).toBe(5);
		expect(result.structuredContent.page).toBe(1);
		expect(result.structuredContent.rows.length).toBeLessThanOrEqual(5);
	});

	it("counts an API key on the MCP path in the shared REST window", async () => {
		const key = await db.apikey.findFirstOrThrow({
			where: { referenceId: userId },
			select: { id: true },
		});
		await fillWindow(storeKeyOf(key.id));

		const response = await mcp(rpc("tools/list"), headers());

		expect(response.status).toBe(429);
		expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
		await db.rateLimit.deleteMany({ where: { key: storeKeyOf(key.id) } });
	});

	it("refuses a page larger than the MCP limit", async () => {
		const response = await callTool(
			"list_win_back_candidates",
			{ pageSize: MCP.limits.winBack.maxRows + 1 },
			headers(),
		);

		expect(response.body.result?.isError ?? response.body.error).toBeTruthy();
	});
});

describe("the OAuth flow for an AI client", () => {
	let accessToken = "";

	it("registers a public client", async () => {
		const response = await request(server)
			.post("/api/auth/oauth2/register")
			.send({
				client_name: "MCP flow spec",
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
			});

		expect(response.status).toBe(200);
		clientId = response.body.client_id;
		expect(clientId.length).toBeGreaterThan(0);
	});

	it("walks authorize, consent and token, then reads the CRM with the token", async () => {
		const { verifier, challenge } = pkce();
		const query = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: redirectUri,
			scope: MCP.scopes.join(" "),
			code_challenge: challenge,
			code_challenge_method: "S256",
			state: "x",
			resource: mcpUrl(apiUrl),
		});

		const authorize = await request(server)
			.get(`/api/auth/oauth2/authorize?${query}`)
			.set("cookie", cookie)
			.set("accept", "application/json");
		expect(authorize.status).toBe(200);
		expect(authorize.body.redirect).toBe(true);
		const consentPage = new URL(authorize.body.url);
		expect(`${consentPage.origin}${consentPage.pathname}`).toBe(
			new URL(MCP_AUTH.pages.consent, appUrl).toString(),
		);

		const consent = await request(server)
			.post("/api/auth/oauth2/consent")
			.set("cookie", cookie)
			.set("origin", appUrl)
			.set("accept", "application/json")
			.send({ accept: true, oauth_query: consentPage.search.slice(1) });
		expect(consent.status).toBe(200);
		const callback = new URL(consent.body.url);
		expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
		expect(callback.searchParams.get("state")).toBe("x");
		const code = callback.searchParams.get("code");
		expect(code).toBeTruthy();

		const token = await request(server)
			.post("/api/auth/oauth2/token")
			.type("form")
			.send({
				grant_type: "authorization_code",
				code: code ?? "",
				code_verifier: verifier,
				redirect_uri: redirectUri,
				client_id: clientId,
				resource: mcpUrl(apiUrl),
			});
		expect(token.status).toBe(200);
		expect(token.body.token_type).toBe("Bearer");
		accessToken = token.body.access_token;
		expect(token.body.refresh_token).toBeTruthy();

		const list = await mcp(rpc("tools/list"), {
			authorization: `Bearer ${accessToken}`,
		});
		expect(list.status).toBe(200);
		expect(list.body.result.tools).toHaveLength(MCP_TOOL_NAMES.length);
	});

	it("answers a browser navigation that came through the app proxy with a real redirect", async () => {
		const query = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: redirectUri,
			scope: MCP.scopes.join(" "),
			code_challenge: pkce().challenge,
			code_challenge_method: "S256",
			state: "proxied",
		});

		const navigation = await request(server)
			.get(`/api/auth/oauth2/authorize?${query}`)
			.set("accept", "text/html,application/xhtml+xml")
			.set("sec-fetch-mode", "cors")
			.set("sec-fetch-dest", "document")
			.redirects(0);
		expect(navigation.status).toBe(302);
		const signInPage = new URL(navigation.headers.location ?? "");
		expect(`${signInPage.origin}${signInPage.pathname}`).toBe(
			new URL(MCP_AUTH.pages.login, appUrl).toString(),
		);
		expect(signInPage.searchParams.get("state")).toBe("proxied");

		const fetched = await request(server)
			.get(`/api/auth/oauth2/authorize?${query}`)
			.set("accept", "application/json")
			.set("sec-fetch-mode", "cors")
			.set("sec-fetch-dest", "empty");
		expect(fetched.status).toBe(200);
		expect(fetched.body.redirect).toBe(true);
	});

	it("sends a visitor without a session to the sign-in page and resumes after the sign-in", async () => {
		const { challenge } = pkce();
		const query = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: redirectUri,
			scope: MCP.scopes.join(" "),
			code_challenge: challenge,
			code_challenge_method: "S256",
			state: "visitor",
			resource: mcpUrl(apiUrl),
		});

		const authorize = await request(server)
			.get(`/api/auth/oauth2/authorize?${query}`)
			.set("accept", "application/json");
		expect(authorize.status).toBe(200);
		expect(authorize.body.redirect).toBe(true);
		const signInPage = new URL(authorize.body.url);
		expect(`${signInPage.origin}${signInPage.pathname}`).toBe(
			new URL(MCP_AUTH.pages.login, appUrl).toString(),
		);
		expect(signInPage.searchParams.get("client_id")).toBe(clientId);
		expect(signInPage.searchParams.get("sig")).toBeTruthy();

		const signIn = await request(server)
			.post("/api/auth/sign-in/email")
			.set("origin", appUrl)
			.set("accept", "application/json")
			.send({ email, password, oauth_query: signInPage.search.slice(1) });
		expect(signIn.status).toBe(200);
		expect(signIn.body.redirect).toBe(true);
		const callback = new URL(signIn.body.url);
		expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
		expect(callback.searchParams.get("state")).toBe("visitor");
		expect(callback.searchParams.get("code")).toBeTruthy();
	});

	it("serves a workspace that lives under its own path", async () => {
		const base = apiUrl.replace(/\/+$/, "");
		const scoped = spyOn(cloud, "scopedPath").mockImplementation(
			(path: string) => path.replace(/^\/api\//, "/api/w/acme/"),
		);
		try {
			const challengeResponse = await mcp(initialize, {});
			expect(challengeResponse.status).toBe(401);
			expect(challengeResponse.headers["www-authenticate"]).toBe(
				`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/api/w/acme/mcp"`,
			);

			const status = await request(server)
				.get("/api/trpc/mcp.status")
				.set("cookie", cookie);
			expect(status.status).toBe(200);
			expect(status.body.result.data.url).toBe(`${base}/api/w/acme/mcp`);

			const codeFor = async (state: string) => {
				const { verifier, challenge } = pkce();
				const query = new URLSearchParams({
					response_type: "code",
					client_id: clientId,
					redirect_uri: redirectUri,
					scope: MCP.scopes.join(" "),
					code_challenge: challenge,
					code_challenge_method: "S256",
					state,
					resource: `${base}/api/w/acme/mcp`,
				});
				const authorize = await request(server)
					.get(`/api/auth/oauth2/authorize?${query}`)
					.set("cookie", cookie)
					.set("accept", "application/json");
				expect([authorize.status, authorize.body]).toEqual([
					200,
					expect.objectContaining({ redirect: true }),
				]);
				const granted = new URL(authorize.body.url);
				expect(`${granted.origin}${granted.pathname}`).toBe(redirectUri);
				expect(granted.searchParams.get("iss")).toBe(`${base}/api/w/acme/auth`);
				const code = granted.searchParams.get("code");
				expect(code).toBeTruthy();
				return { code: code ?? "", verifier };
			};

			const tokenFor = async (resource: string) => {
				const { code, verifier } = await codeFor(`token-${resource.length}`);
				return request(server)
					.post("/api/auth/oauth2/token")
					.type("form")
					.send({
						grant_type: "authorization_code",
						code,
						code_verifier: verifier,
						redirect_uri: redirectUri,
						client_id: clientId,
						resource,
					});
			};

			const navigated = await request(server)
				.get(
					`/api/auth/oauth2/authorize?${new URLSearchParams({
						response_type: "code",
						client_id: clientId,
						redirect_uri: redirectUri,
						scope: MCP.scopes.join(" "),
						code_challenge: pkce().challenge,
						code_challenge_method: "S256",
						state: "navigated",
					})}`,
				)
				.set("cookie", cookie)
				.set("accept", "text/html")
				.redirects(0);
			expect(navigated.status).toBe(302);
			const location = new URL(navigated.headers.location ?? "");
			expect(`${location.origin}${location.pathname}`).toBe(redirectUri);
			expect(location.searchParams.get("iss")).toBe(`${base}/api/w/acme/auth`);

			const foreign = await tokenFor(`${base}/api/w/other/mcp`);
			expect(foreign.status).toBe(400);
			expect(foreign.body.error).toBe("invalid_request");

			const own = await tokenFor(`${base}/api/w/acme/mcp`);
			expect(own.status).toBe(200);
			expect(own.body.access_token).toBeTruthy();

			const list = await mcp(rpc("tools/list"), {
				authorization: `Bearer ${own.body.access_token}`,
			});
			expect(list.status).toBe(200);
			expect(list.body.result.tools).toHaveLength(MCP_TOOL_NAMES.length);
		} finally {
			scoped.mockRestore();
		}
	});

	it("counts a bearer caller against the MCP rate limit", async () => {
		const row = await db.oauthAccessToken.findFirstOrThrow({
			where: { userId, clientId },
			select: { id: true },
		});
		await fillWindow(storeKeyOf(row.id));

		const response = await mcp(rpc("tools/list"), {
			authorization: `Bearer ${accessToken}`,
		});

		expect(response.status).toBe(429);
		expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
		expect(response.body.error.code).toBe(-32000);
		await db.rateLimit.deleteMany({ where: { key: storeKeyOf(row.id) } });
	});

	it("stops answering the token once the access of the person ends", async () => {
		expect(accessToken.length).toBeGreaterThan(0);

		await endAiClientAccessOf(db, [userId]);

		const response = await mcp(rpc("tools/list"), {
			authorization: `Bearer ${accessToken}`,
		});
		expect(response.status).toBe(401);
		expect(await db.oauthConsent.count({ where: { userId, clientId } })).toBe(
			0,
		);
	});

	it("refuses an API key on the consent endpoint", async () => {
		const response = await request(server)
			.post("/api/auth/oauth2/consent")
			.set(API_KEY_HEADER, apiKey)
			.set("origin", appUrl)
			.set("accept", "application/json")
			.send({ accept: true, oauth_query: "client_id=x" });

		expect(response.status).toBe(401);
	});
});
