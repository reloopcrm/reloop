import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { apiUrl, mcpUrl } from "@crm/auth";
import { db } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

type App = Awaited<ReturnType<typeof createApp>>;

const AUTHORIZATION_SERVER = [
	"/.well-known/oauth-authorization-server",
	"/.well-known/oauth-authorization-server/api/auth",
];
const PROTECTED_RESOURCE = [
	"/.well-known/oauth-protected-resource",
	"/.well-known/oauth-protected-resource/api/mcp",
];

let app: App | undefined;
let server: ReturnType<App["getHttpServer"]>;
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

	app = await createApp();
	server = app.getHttpServer();
});

afterAll(async () => {
	await app?.close();
	for (const spy of spies) spy.mockRestore();
});

function expectOpenMetadata(headers: Record<string, string>) {
	expect(headers["access-control-allow-origin"]).toBe("*");
	expect(headers["cache-control"]).toBe("no-store");
	expect(headers["content-type"]).toContain("application/json");
}

describe("the OAuth metadata for AI clients", () => {
	for (const path of AUTHORIZATION_SERVER)
		it(`serves the authorization server metadata at ${path}`, async () => {
			const response = await request(server).get(path);

			expect(response.status).toBe(200);
			expectOpenMetadata(response.headers);
			expect(response.body.issuer).toBe(
				`${apiUrl.replace(/\/+$/, "")}/api/auth`,
			);
			expect(response.body.authorization_endpoint).toBe(
				`${response.body.issuer}/oauth2/authorize`,
			);
			expect(response.body.token_endpoint).toBe(
				`${response.body.issuer}/oauth2/token`,
			);
			expect(response.body.registration_endpoint).toBe(
				`${response.body.issuer}/oauth2/register`,
			);
			expect(response.body.code_challenge_methods_supported).toEqual(["S256"]);
			expect(response.body.scopes_supported).toEqual([
				"crm:read",
				"offline_access",
			]);
		});

	for (const path of PROTECTED_RESOURCE)
		it(`serves the protected resource metadata at ${path}`, async () => {
			const response = await request(server).get(path);

			expect(response.status).toBe(200);
			expectOpenMetadata(response.headers);
			expect(response.body).toEqual({
				resource: mcpUrl(apiUrl),
				authorization_servers: [`${apiUrl.replace(/\/+$/, "")}/api/auth`],
				scopes_supported: ["crm:read", "offline_access"],
				bearer_methods_supported: ["header"],
				resource_name: "Reloop CRM",
			});
		});

	it("names the issuer the authorization server advertises", async () => {
		const metadata = await request(server).get(AUTHORIZATION_SERVER[0] ?? "");
		const resource = await request(server).get(PROTECTED_RESOURCE[1] ?? "");

		expect(resource.body.authorization_servers[0]).toBe(metadata.body.issuer);
	});

	it("answers HEAD on every metadata route", async () => {
		for (const path of [...AUTHORIZATION_SERVER, ...PROTECTED_RESOURCE]) {
			const response = await request(server).head(path);
			expect(response.status).toBe(200);
		}
	});
});

describe("the OAuth metadata under a workspace path", () => {
	const base = apiUrl.replace(/\/+$/, "");
	let scoped: ReturnType<typeof spyOn> | undefined;

	beforeAll(() => {
		scoped = spyOn(cloud, "scopedPath").mockImplementation((path: string) =>
			path.replace(/^\/api\//, "/api/w/acme/"),
		);
	});

	afterAll(() => {
		scoped?.mockRestore();
	});

	it("moves the issuer and every endpoint under the workspace path", async () => {
		const response = await request(server).get(AUTHORIZATION_SERVER[1] ?? "");

		expect(response.status).toBe(200);
		expect(response.body.issuer).toBe(`${base}/api/w/acme/auth`);
		expect(response.body.authorization_endpoint).toBe(
			`${base}/api/w/acme/auth/oauth2/authorize`,
		);
		expect(response.body.token_endpoint).toBe(
			`${base}/api/w/acme/auth/oauth2/token`,
		);
		expect(response.body.registration_endpoint).toBe(
			`${base}/api/w/acme/auth/oauth2/register`,
		);
		expect(response.body.revocation_endpoint).toBe(
			`${base}/api/w/acme/auth/oauth2/revoke`,
		);
		expect(response.body.authorization_response_iss_parameter_supported).toBe(
			true,
		);
		expect(JSON.stringify(response.body)).not.toContain(`${base}/api/auth`);
	});

	it("names the workspace resource and its issuer", async () => {
		const response = await request(server).get(PROTECTED_RESOURCE[1] ?? "");

		expect(response.status).toBe(200);
		expect(response.body.resource).toBe(`${base}/api/w/acme/mcp`);
		expect(response.body.authorization_servers).toEqual([
			`${base}/api/w/acme/auth`,
		]);
	});
});
