import { join } from "node:path";
import { loadRootEnv } from "@crm/env";
import type { NextConfig } from "next";

loadRootEnv();

const apiUrl =
	process.env.API_URL ??
	process.env.NEXT_PUBLIC_API_URL ??
	"http://localhost:3001";

const allowedDevOrigins = (process.env.APP_URL ?? "")
	.split(",")
	.flatMap((origin) => {
		try {
			return [new URL(origin.trim()).hostname];
		} catch {
			return [];
		}
	});

const nextConfig: NextConfig = {
	allowedDevOrigins,

	output: "standalone",
	distDir: process.env.NEXT_DIST_DIR ?? ".next",
	outputFileTracingRoot: join(import.meta.dirname, "../.."),

	async redirects() {
		return [
			{
				source: "/install.sh",
				destination:
					"https://raw.githubusercontent.com/reloopcrm/reloop/main/install.sh",
				permanent: false,
			},
			{
				source: "/for/freight-forwarding",
				destination: "/win-back-customers",
				permanent: true,
			},
		];
	},

	env: {
		NEXT_PUBLIC_API_URL: apiUrl,
	},

	transpilePackages: ["@crm/auth", "@crm/db", "@crm/telemetry", "@crm/ui"],

	serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],

	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "**.blob.vercel-storage.com" },
		],
	},

	cacheComponents: true,
	partialPrefetching: true,
};

export default nextConfig;
