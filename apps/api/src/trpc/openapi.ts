import type { OpenApiMeta } from "trpc-to-openapi";

const PROXIED_BRIDGE_PATH = "/api/rest";

export const REST = {
	bridge: {
		mounts: ["/rest", PROXIED_BRIDGE_PATH],
		baseUrl: PROXIED_BRIDGE_PATH,
	},
	document: { path: "/api/openapi.json" },
} as const;

export type RestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export function restMeta(
	method: RestMethod,
	path: `/${string}`,
	tags: string[],
	options: { protect?: boolean } = {},
): OpenApiMeta {
	return {
		openapi: {
			method,
			path,
			tags,
			protect: options.protect ?? true,
		},
	};
}
