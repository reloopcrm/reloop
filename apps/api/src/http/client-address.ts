import { isIP } from "node:net";
import type { Request } from "express";
import { CLIENT_ADDRESS } from "./http-config";

export function clientAddressOf(req: Request | undefined): string | null {
	const forwarded = req?.headers[CLIENT_ADDRESS.header];
	const header = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
	const candidate = header?.split(",").at(-1)?.trim() ?? "";

	return isIP(candidate) === 0 ? null : candidate;
}
