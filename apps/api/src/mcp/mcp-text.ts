import { appUrl } from "@crm/auth";
import { MCP, type McpRecordKind } from "./mcp.config";

const ELLIPSIS = "…";

function trimBase(url: string): string {
	return url.replace(/\/+$/, "");
}

export function clip(value: string, max: number): string {
	return value.length > max
		? `${value.slice(0, max - ELLIPSIS.length)}${ELLIPSIS}`
		: value;
}

export function clipOrNull(
	value: string | null | undefined,
	max: number,
): string | null {
	return value ? clip(value, max) : null;
}

export function label(value: string | null | undefined): string | null {
	return clipOrNull(value, MCP.limits.text.maxChars);
}

export function summary(value: string | null | undefined): string | null {
	return clipOrNull(value?.trim(), MCP.limits.summary.maxChars);
}

export function personName(
	first: string | null | undefined,
	last: string | null | undefined,
	email?: string | null,
): string {
	const name = [first, last].filter(Boolean).join(" ").trim();
	return clip(name || email || "", MCP.limits.text.maxChars);
}

export function recordUrl(kind: McpRecordKind, id: string): string {
	return `${trimBase(appUrl)}/${MCP.record.appPaths[kind]}/${encodeURIComponent(id)}`;
}

export function recordRef(kind: McpRecordKind, id: string): string {
	return `${kind}${MCP.record.separator}${id}`;
}
