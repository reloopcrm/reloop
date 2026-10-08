import type { LookupAddress } from "node:dns";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { NETWORK } from "./network-config";

const MAX_REDIRECTS = NETWORK.maxRedirects;
const DEFAULT_TIMEOUT_MS = NETWORK.timeoutMs;
const READ_TIMEOUT_MS = NETWORK.readTimeoutMs;

type RequestMethod = "GET" | "HEAD" | "POST";

type RequestHeaders = Record<string, string>;

export function isBlockedAddress(ip: string, allowPrivate = false): boolean {
	if (ip.includes(":")) {
		const groups = expandIPv6(ip);
		return groups ? isBlockedIPv6(groups, ip, allowPrivate) : true;
	}

	if (net.isIPv4(ip)) return isBlockedIPv4(ipv4Octets(ip), allowPrivate);

	return true;
}

type IPv4Octets = readonly [number, number, number, number];

function isBlockedIPv6(
	groups: number[],
	ip: string,
	allowPrivate: boolean,
): boolean {
	const marker = groups[5];
	if (
		groups.slice(0, 5).every((group) => group === 0) &&
		(marker === 0xffff || marker === 0)
	) {
		const high = groups[6] ?? 0;
		const low = groups[7] ?? 0;
		const loopbackV6 =
			marker === 0 && high === 0 && low === 1 && !ip.includes(".");
		if (loopbackV6) return !allowPrivate;

		return isBlockedIPv4(octetsOf(high, low), allowPrivate);
	}

	const [first = 0, second = 0, third = 0] = groups;

	if (
		first === 0x64 &&
		second === 0xff9b &&
		groups.slice(2, 6).every((group) => group === 0)
	)
		return isBlockedIPv4(
			octetsOf(groups[6] ?? 0, groups[7] ?? 0),
			allowPrivate,
		);

	if (first === 0x2002)
		return isBlockedIPv4(octetsOf(second, third), allowPrivate);

	if (METADATA_IPV6.has(groups.join(":"))) return true;

	if (allowPrivate && (first & 0xfe00) === 0xfc00) return false;

	return (
		(first & 0xfe00) === 0xfc00 ||
		(first & 0xffc0) === 0xfe80 ||
		(first & 0xff00) === 0xff00
	);
}

function ipv4Octets(ip: string): IPv4Octets {
	const [a = 0, b = 0, c = 0, d = 0] = ip.split(".").map(Number);
	return [a, b, c, d];
}

function octetsOf(high: number, low: number): IPv4Octets {
	return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isBlockedIPv4(octets: IPv4Octets, allowPrivate = false): boolean {
	if (isNeverAllowedIPv4(octets)) return true;

	return !allowPrivate && isPrivateIPv4(octets);
}

function isNeverAllowedIPv4(octets: IPv4Octets): boolean {
	const [a, b] = octets;
	return (
		a === 0 ||
		(a === 169 && b === 254) ||
		a >= 224 ||
		METADATA_IPV4.has(octets.join("."))
	);
}

function isPrivateIPv4([a, b, c]: IPv4Octets): boolean {
	return (
		a === 10 ||
		a === 127 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 198 && (b === 18 || b === 19)) ||
		(a === 192 && b === 0 && (c === 0 || c === 2)) ||
		(a === 198 && b === 51 && c === 100) ||
		(a === 203 && b === 0 && c === 113)
	);
}

function expandIPv6(ip: string): number[] | null {
	let text = (ip.split("%")[0] ?? "").toLowerCase();

	const embedded: number[] = [];
	const lastColon = text.lastIndexOf(":");
	const tail = text.slice(lastColon + 1);
	if (tail.includes(".")) {
		if (!net.isIPv4(tail)) return null;
		const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
		embedded.push((a << 8) | b, (c << 8) | d);
		text = text.slice(0, lastColon + 1);
	}

	const [headText = "", runText, extra] = text.split("::");
	if (extra !== undefined) return null;

	const parse = (part: string) =>
		part
			.split(":")
			.filter((group) => group !== "")
			.map((group) =>
				/^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN,
			);

	const head = parse(headText);
	const run = runText === undefined ? [] : parse(runText);
	const missing = 8 - head.length - run.length - embedded.length;
	if (runText !== undefined && missing < 0) return null;

	const fill = runText === undefined ? [] : Array<number>(missing).fill(0);
	const groups = [...head, ...fill, ...run, ...embedded];
	if (groups.length !== 8 || groups.some((group) => Number.isNaN(group)))
		return null;

	return groups;
}

const METADATA_IPV4: ReadonlySet<string> = new Set(
	NETWORK.metadataAddresses.ipv4,
);

const METADATA_IPV6: ReadonlySet<string> = new Set(
	NETWORK.metadataAddresses.ipv6.flatMap((ip) => {
		const groups = expandIPv6(ip);
		return groups ? [groups.join(":")] : [];
	}),
);

export async function resolvePublicHost(
	hostname: string,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
	allowPrivate = false,
): Promise<LookupAddress | null> {
	const literal = hostname.replace(/^\[|\]$/g, "");
	if (net.isIP(literal))
		return isBlockedAddress(literal, allowPrivate)
			? null
			: { address: literal, family: net.isIP(literal) };

	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const addresses = await Promise.race([
			dns.lookup(hostname, { all: true }),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`${hostname} did not resolve in time`)),
					timeoutMs,
				);
			}),
		]);

		return addresses.length > 0 &&
			addresses.every(
				(address) => !isBlockedAddress(address.address, allowPrivate),
			)
			? (addresses[0] ?? null)
			: null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function resolvesToPublicHost(
	hostname: string,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
	return (await resolvePublicHost(hostname, timeoutMs)) !== null;
}

function pinnedFetch(
	target: URL,
	address: LookupAddress,
	method: RequestMethod,
	timeoutMs: number,
	headers?: RequestHeaders,
	body?: string,
): Promise<Response> {
	const requestHeaders: RequestHeaders = {
		"user-agent": "Mozilla/5.0 (compatible; CRM/1.0)",
		"accept-encoding": "identity",
		...headers,
	};
	if (body !== undefined) {
		requestHeaders["content-length"] = String(Buffer.byteLength(body));
	}

	return new Promise((resolve, reject) => {
		const transport = target.protocol === "https:" ? https : http;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const request = transport.request(
			target,
			{
				method,
				agent: false,
				signal: AbortSignal.timeout(timeoutMs),
				lookup: (_host, options, callback) => {
					if (options.all) callback(null, [address]);
					else callback(null, address.address, address.family);
				},
				headers: requestHeaders,
			},
			(incoming) => {
				clearTimeout(timer);
				incoming.on("error", reject);
				try {
					const responseHeaders = new Headers();
					for (const [name, value] of Object.entries(incoming.headers)) {
						if (Array.isArray(value))
							value.forEach((entry) => {
								responseHeaders.append(name, entry);
							});
						else if (value !== undefined) responseHeaders.set(name, value);
					}
					const status = incoming.statusCode ?? 502;
					const empty = method === "HEAD" || [204, 205, 304].includes(status);
					if (empty) incoming.resume();
					resolve(
						new Response(
							empty
								? null
								: (Readable.toWeb(incoming) as ReadableStream<Uint8Array>),
							{ status, headers: responseHeaders },
						),
					);
				} catch (error) {
					incoming.destroy();
					reject(error);
				}
			},
		);
		request.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		timer = setTimeout(() => {
			request.destroy();
			reject(new Error(`${target.hostname} did not answer in time`));
		}, timeoutMs);
		request.end(body);
	});
}

export async function safeFetch(
	url: string,
	{
		method = "GET",
		timeoutMs = DEFAULT_TIMEOUT_MS,
		headers,
		body,
		allowPrivateHost = false,
	}: {
		method?: RequestMethod;
		timeoutMs?: number;
		headers?: RequestHeaders;
		body?: string;
		allowPrivateHost?: boolean;
	} = {},
): Promise<{ response: Response; url: URL } | null> {
	let target: URL;
	let requestHeaders = headers;
	try {
		target = new URL(url);
	} catch {
		return null;
	}

	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		if (target.protocol !== "https:" && target.protocol !== "http:")
			return null;
		const address = await resolvePublicHost(
			target.hostname,
			timeoutMs,
			allowPrivateHost,
		);
		if (!address || target.username || target.password) return null;

		let response: Response;
		try {
			response = await pinnedFetch(
				target,
				address,
				method,
				timeoutMs,
				requestHeaders,
				body,
			);
		} catch {
			return null;
		}

		const location = response.headers.get("location");
		if (
			method !== "POST" &&
			response.status >= 300 &&
			response.status < 400 &&
			location
		) {
			try {
				await response.body?.cancel();
				const next = new URL(location, target);
				if (target.protocol === "https:" && next.protocol !== "https:")
					return null;
				if (next.origin !== target.origin) requestHeaders = undefined;
				target = next;
			} catch {
				return null;
			}
			continue;
		}

		return { response, url: target };
	}

	return null;
}

export async function readCapped(
	response: Response,
	maxBytes: number,
	timeoutMs: number = READ_TIMEOUT_MS,
): Promise<string> {
	const body = response.body;
	if (!body) return "";

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	const cutoff = AbortSignal.timeout(timeoutMs);
	const stop = () => {
		void reader.cancel().catch(() => undefined);
	};

	cutoff.addEventListener("abort", stop, { once: true });
	let size = 0;

	try {
		while (size < maxBytes) {
			const { done, value } = await reader.read();
			if (done) break;

			chunks.push(value);
			size += value.byteLength;
		}
	} finally {
		cutoff.removeEventListener("abort", stop);
		await reader.cancel().catch(() => undefined);
	}

	return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, maxBytes));
}
