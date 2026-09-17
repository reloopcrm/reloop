import { isIP } from "node:net";

export const PROXY = {
	strip: [
		"host",
		"x-forwarded-host",
		"x-forwarded-proto",
		"x-forwarded-for",
		"forwarded",
		"transfer-encoding",
		"connection",
		"keep-alive",
		"content-length",
		"expect",
	],
	clientAddress: "x-forwarded-for",
} as const;

export function trustedClientAddress(value: string | null): string | null {
	if (!value) return null;

	const hops = value.split(",");
	const last = hops[hops.length - 1]?.trim() ?? "";

	return isIP(last) === 0 ? null : last;
}

export function proxyRequestHeaders(source: Headers): Headers {
	const address = trustedClientAddress(source.get(PROXY.clientAddress));
	const headers = new Headers(source);

	for (const header of PROXY.strip) headers.delete(header);
	if (address) headers.set(PROXY.clientAddress, address);

	return headers;
}
