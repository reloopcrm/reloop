import {
	API_KEY_HEADER,
	AUTH_COOKIE_PREFIX,
	cookieValue,
	readTenantCookie,
	TENANT_COOKIE_NAME,
	tenantIdFromApiKey,
} from "@crm/auth";
import { type Tenant, tenantById, tenantBySite } from "@crm/db/tenancy";
import { isHosted, runAsTenant } from "@crm/db/tenant-context";
import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const OPEN_PATH =
	/^\/(health$|internal\/|api\/tenant\/|api\/billing\/webhook$)/;
const AUTH_PATH = "/api/auth/";
const TRPC_PATH = "/api/trpc/";
const PAUSED_PROCEDURES = /^(billing\.|workspace\.(delete|deletionCode)$)/;

export function openWhileSuspended(path: string): boolean {
	if (path.startsWith(AUTH_PATH)) return true;
	if (!path.startsWith(TRPC_PATH)) return false;
	const procedures = path.slice(TRPC_PATH.length).split(",");
	return procedures.every((procedure) => PAUSED_PROCEDURES.test(procedure));
}
const SITE_CONFIG_PATH = /^\/api\/t\/config\/([^/]+)$/;
const COLLECTOR_PATH = "/api/t/e";

const logger = new Logger("Tenant");

export function tenantMiddleware() {
	return async (
		request: Request,
		response: Response,
		next: NextFunction,
	): Promise<void> => {
		if (!isHosted()) {
			next();
			return;
		}

		const path = request.path;
		if (OPEN_PATH.test(path) || path === COLLECTOR_PATH) {
			withoutSession(request);
			next();
			return;
		}

		let tenant: Tenant | null;
		try {
			tenant = await resolveTenant(request);
		} catch (error) {
			logger.error(
				{ message: "Tenant registry did not answer" },
				error instanceof Error ? error.stack : String(error),
			);
			response.status(503).json({ message: "REGISTRY_UNAVAILABLE" });
			return;
		}

		if (!tenant) {
			response.status(401).json({ message: "TENANT_REQUIRED" });
			return;
		}

		const paused = tenant.status === "suspended" && openWhileSuspended(path);
		if (tenant.status !== "active" && tenant.status !== "pending" && !paused) {
			response.status(403).json({ message: "TENANT_SUSPENDED" });
			return;
		}

		await runAsTenant(
			tenant,
			() =>
				new Promise<void>((settled) => {
					response.once("close", settled);
					next();
				}),
		);
	};
}

async function resolveTenant(request: Request): Promise<Tenant | null> {
	const fromKey = tenantIdFromApiKey(request.get(API_KEY_HEADER));
	if (fromKey) return tenantById(fromKey);

	const fromCookie = readTenantCookie(
		cookieValue(request.get("cookie"), TENANT_COOKIE_NAME),
		process.env.BETTER_AUTH_SECRET ?? "",
	);
	if (fromCookie) return tenantById(fromCookie);

	const siteId = SITE_CONFIG_PATH.exec(request.path)?.[1];
	if (siteId) return tenantBySite(decodeURIComponent(siteId));

	return null;
}

const SECURE_PREFIX = /^__(Secure|Host)-/;

function isSessionCookie(name: string): boolean {
	const bare = name.replace(SECURE_PREFIX, "");
	return (
		bare.startsWith(`${AUTH_COOKIE_PREFIX}.`) && bare !== TENANT_COOKIE_NAME
	);
}

function withoutSession(request: Request): void {
	const header = request.headers.cookie;
	if (!header) return;

	const kept = header
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part && !isSessionCookie(part.split("=")[0] ?? ""));

	if (kept.length) request.headers.cookie = kept.join("; ");
	else delete request.headers.cookie;
}
