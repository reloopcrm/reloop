import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { cloud } from "@crm/db/cloud/scope";
import { apiUrl } from "../src/env";
import {
	authIssuer,
	canonicalMcpResource,
	issuerForm,
	mcpAddress,
	mcpIssuer,
	protectedResourceMetadataUrl,
	scopeAuthorizationServer,
} from "../src/mcp-address";
import { mcpUrl } from "../src/mcp-config";

const base = apiUrl.replace(/\/+$/, "");
const scopedPath = (path: string) => path.replace(/^\/api\//, "/api/w/acme/");

describe("the issuer form", () => {
	it("writes the issuer the way the plugin writes it", () => {
		expect(issuerForm("https://CRM.example.com:443/api/auth/")).toBe(
			"https://crm.example.com/api/auth",
		);
		expect(issuerForm("http://crm.example.com/api/auth?x=1#y")).toBe(
			"https://crm.example.com/api/auth",
		);
		expect(issuerForm("http://localhost:3001/api/auth")).toBe(
			"http://localhost:3001/api/auth",
		);
		expect(issuerForm("http://127.0.0.1:3001/api/auth")).toBe(
			"http://127.0.0.1:3001/api/auth",
		);
	});
});

describe("the MCP addresses on a self-hosted install", () => {
	it("name the public paths", () => {
		expect(mcpAddress()).toBe(mcpUrl(apiUrl));
		expect(mcpIssuer()).toBe(authIssuer());
		expect(protectedResourceMetadataUrl()).toBe(
			`${base}/.well-known/oauth-protected-resource/api/mcp`,
		);
		expect(canonicalMcpResource(mcpUrl(apiUrl))).toBe(mcpUrl(apiUrl));
	});

	it("leave the authorization server metadata as it is", () => {
		const metadata = {
			issuer: authIssuer(),
			token_endpoint: `${base}/api/auth/oauth2/token`,
		};
		expect(scopeAuthorizationServer(metadata, mcpIssuer())).toBe(metadata);
	});
});

describe("the MCP addresses under a workspace path", () => {
	let scoped: ReturnType<typeof spyOn> | undefined;

	afterEach(() => {
		scoped?.mockRestore();
	});

	it("move the resource, the issuer and the challenge under the path", () => {
		scoped = spyOn(cloud, "scopedPath").mockImplementation(scopedPath);

		expect(mcpAddress()).toBe(`${base}/api/w/acme/mcp`);
		expect(mcpIssuer()).toBe(`${base}/api/w/acme/auth`);
		expect(protectedResourceMetadataUrl()).toBe(
			`${base}/.well-known/oauth-protected-resource/api/w/acme/mcp`,
		);
		expect(canonicalMcpResource(`${base}/api/w/acme/mcp`)).toBe(mcpUrl(apiUrl));
		expect(canonicalMcpResource(`${base}/api/w/other/mcp`)).toBe(
			`${base}/api/w/other/mcp`,
		);
	});

	it("move every endpoint of the metadata, raw or in issuer form", () => {
		scoped = spyOn(cloud, "scopedPath").mockImplementation(scopedPath);
		const metadata = {
			issuer: authIssuer(),
			authorization_endpoint: `${base}/api/auth/oauth2/authorize`,
			token_endpoint: `${base}/api/auth/oauth2/token`,
			registration_endpoint: `${base}/api/auth/oauth2/register`,
			jwks_uri: undefined,
			scopes_supported: ["crm:read"],
			authorization_response_iss_parameter_supported: true,
		};

		expect(scopeAuthorizationServer(metadata, mcpIssuer())).toEqual({
			issuer: `${base}/api/w/acme/auth`,
			authorization_endpoint: `${base}/api/w/acme/auth/oauth2/authorize`,
			token_endpoint: `${base}/api/w/acme/auth/oauth2/token`,
			registration_endpoint: `${base}/api/w/acme/auth/oauth2/register`,
			jwks_uri: undefined,
			scopes_supported: ["crm:read"],
			authorization_response_iss_parameter_supported: true,
		});
	});
});
