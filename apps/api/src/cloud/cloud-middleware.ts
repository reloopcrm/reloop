import type { RequestHandler } from "express";
import { tenantMiddleware } from "../tenancy/tenant.middleware";

export function cloudMiddleware(): RequestHandler[] {
	return [tenantMiddleware()];
}
