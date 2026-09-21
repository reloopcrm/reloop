import {
	API_KEY_HEADER,
	cookieValue,
	readTenantCookie,
	TENANT_COOKIE_NAME,
	tenantIdFromApiKey,
} from "@crm/auth";
import { type Tenant, tenantById, tenantBySite } from "@crm/db/tenancy";
import { isHosted, runAsTenant } from "@crm/db/tenant-context";
import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const OPEN_PATH = /^\/(health$|internal\/)/;
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

		if (tenant.status !== "active") {
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
