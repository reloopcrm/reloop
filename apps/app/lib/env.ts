export const API_URL =
	process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function isMarketing(): boolean {
	return process.env.IS_MARKETING === "true";
}

export function marketingHosts(): string[] {
	return (process.env.RELOOP_MARKETING_HOST ?? "")
		.split(",")
		.map((host) => host.trim().toLowerCase())
		.filter(Boolean);
}

export function isMarketingHost(host: string | null | undefined): boolean {
	const bare = host?.split(",")[0]?.trim().toLowerCase().replace(/:\d+$/, "");
	return Boolean(bare) && marketingHosts().includes(bare as string);
}
