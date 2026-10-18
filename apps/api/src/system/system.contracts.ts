import { z } from "zod";

export const versionOutput = z.object({
	current: z.string(),
	latest: z.string().nullable(),
	updateAvailable: z.boolean(),
	releaseUrl: z.string().nullable(),
	checkedAt: z.string().nullable(),
	checkDisabled: z.boolean(),
	updaterAvailable: z.boolean(),
});

export type VersionInfo = z.infer<typeof versionOutput>;

export const updateOutput = z.object({
	status: z.enum(["started", "unavailable", "refused"]),
});

export type UpdateResult = z.infer<typeof updateOutput>;

export const githubRelease = z.object({
	tag_name: z.string().trim().min(1),
	html_url: z.string().url(),
});

export type GithubRelease = z.infer<typeof githubRelease>;

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

export type Semver = readonly [number, number, number];

export function parseSemver(value: string): Semver | null {
	const match = SEMVER.exec(value.trim());
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(candidate: string, current: string): boolean {
	const next = parseSemver(candidate);
	const now = parseSemver(current);
	if (!next || !now) return false;

	for (let index = 0; index < 3; index += 1) {
		const a = next[index] ?? 0;
		const b = now[index] ?? 0;
		if (a !== b) return a > b;
	}

	return false;
}
