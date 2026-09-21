import "@crm/env/load";

import { currentTenant, isHosted } from "@crm/db/tenant-context";

type AllowList = {
	domains: readonly string[];
	addresses: readonly string[];
};

const EMPTY: AllowList = { domains: [], addresses: [] };

let cachedSource: string | undefined;
let cached: AllowList = EMPTY;

function parseAllowList(entries: readonly string[]): AllowList {
	const domains: string[] = [];
	const addresses: string[] = [];

	for (const raw of entries) {
		const entry = raw.trim().toLowerCase().replace(/^@/, "");
		if (!entry) continue;
		(entry.includes("@") ? addresses : domains).push(entry);
	}

	return { domains, addresses };
}

function allowList(): AllowList {
	if (isHosted()) return parseAllowList(currentTenant().allowList);

	const source = process.env.ALLOWED_SIGN_IN ?? "";
	if (source === cachedSource) return cached;

	cachedSource = source;
	cached = parseAllowList(source.split(","));
	return cached;
}

export function workspaceDomains(): readonly string[] {
	return allowList().domains;
}

export function primaryWorkspaceDomain(): string | undefined {
	return allowList().domains[0];
}

export function hasSignInAllowList(): boolean {
	const { domains, addresses } = allowList();
	return domains.length > 0 || addresses.length > 0;
}

export function isWorkspaceEmail(email: string | null | undefined): boolean {
	const value = email?.trim().toLowerCase();
	if (!value) return false;

	const parts = value.split("@");
	if (parts.length !== 2) return false;

	const [local, host] = parts;
	if (!local || !host) return false;

	const { domains, addresses } = allowList();

	if (addresses.includes(value)) return true;

	return domains.some(
		(domain) => host === domain || host.endsWith(`.${domain}`),
	);
}
