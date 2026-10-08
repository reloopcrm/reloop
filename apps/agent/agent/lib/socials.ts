import { z } from "zod";
import type { Evidence } from "./evidence";
import {
	looksLikeSameCompany,
	nameMatchesLocalPart,
	namesMatch,
} from "./names";
import { ask } from "./perplexity";
import { RESEARCH } from "./research-config";

const text = z.string().trim().min(1).nullable().catch(null);
const rawText = z.string().nullable().catch(null);

const githubAccount = z
	.object({
		login: rawText,
		name: text,
		company: text,
		blog: text,
		bio: text,
		type: rawText,
	})
	.catch({
		login: null,
		name: null,
		company: null,
		blog: null,
		bio: null,
		type: null,
	});

export type Network = "x" | "github";

export type SocialProfile = {
	network: Network;
	handle: string;
	url: string;
};

export type Person = {
	firstName: string;
	lastName: string | null;
	fullName: string;
	title: string | null;
	companyName: string | null;
	companyDomain: string | null;
};

export type Verdict =
	| { accepted: true; profile: SocialProfile; evidence: Evidence[] }
	| { accepted: false; reason: string; answered: boolean };

const { socials } = RESEARCH;

const X_HOSTS = new Set<string>(socials.hosts.x);
const GITHUB_HOSTS = new Set<string>(socials.hosts.github);
const X_RESERVED = new Set<string>(socials.reserved.x);
const GITHUB_RESERVED = new Set<string>(socials.reserved.github);

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export function parseSocialUrl(raw: string): SocialProfile | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	let url: URL;
	try {
		url = new URL(
			/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
		);
	} catch {
		return null;
	}

	const host = url.hostname.toLowerCase();
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments.length !== 1) return null;

	const handle = decodeURIComponent(segments[0] as string).replace(/^@/, "");

	if (X_HOSTS.has(host)) {
		if (X_RESERVED.has(handle.toLowerCase())) return null;
		if (!X_HANDLE.test(handle)) return null;
		return {
			network: "x",
			handle: handle.toLowerCase(),
			url: `https://x.com/${handle}`,
		};
	}

	if (GITHUB_HOSTS.has(host)) {
		if (GITHUB_RESERVED.has(handle.toLowerCase())) return null;
		if (!GITHUB_HANDLE.test(handle)) return null;
		return {
			network: "github",
			handle: handle.toLowerCase(),
			url: `https://github.com/${handle}`,
		};
	}

	return null;
}

export function extractSocialUrls(haystack: string[]): SocialProfile[] {
	const found: SocialProfile[] = [];

	for (const chunk of haystack) {
		for (const match of chunk.matchAll(
			/https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com|github\.com)\/[^\s"'<>)\]},]+/gi,
		)) {
			const profile = parseSocialUrl(match[0].replace(/[.,;:!?]+$/, ""));
			if (profile && !found.some((f) => f.url === profile.url)) {
				found.push(profile);
			}
		}
	}

	return found;
}

type GithubUser = {
	login: string;
	name: string | null;
	company: string | null;
	blog: string | null;
	bio: string | null;
	type: string;
};

async function fetchGithubUser(
	handle: string,
): Promise<
	| { ok: true; user: GithubUser }
	| { ok: false; reason: string; answered: boolean }
> {
	const token = process.env.GITHUB_TOKEN;
	const headers = new Headers({
		accept: "application/vnd.github+json",
		"user-agent": socials.github.userAgent,
	});
	if (token) headers.set("authorization", `Bearer ${token}`);

	try {
		const response = await fetch(
			`${socials.github.endpoint}${encodeURIComponent(handle)}`,
			{ headers, signal: AbortSignal.timeout(socials.github.timeoutMs) },
		);

		if (response.status === 404) {
			return { ok: false, reason: "No such GitHub account.", answered: true };
		}
		if (response.status === 403 || response.status === 429) {
			return {
				ok: false,
				reason: "GitHub rate-limited the check. Try this contact again later.",
				answered: false,
			};
		}
		if (!response.ok) {
			return {
				ok: false,
				reason: `GitHub returned HTTP ${response.status}.`,
				answered: false,
			};
		}

		const account = githubAccount.parse(await response.json());

		return {
			ok: true,
			user: {
				login: account.login ?? handle,
				name: account.name,
				company: account.company,
				blog: account.blog,
				bio: account.bio,
				type: account.type ?? "User",
			},
		};
	} catch (cause) {
		return {
			ok: false,
			reason: cause instanceof Error ? cause.message : String(cause),
			answered: false,
		};
	}
}

export async function verifyGithub(
	profile: SocialProfile,
	person: Person,
): Promise<Verdict> {
	const result = await fetchGithubUser(profile.handle);
	if (!result.ok) {
		return {
			accepted: false,
			reason: result.reason,
			answered: result.answered,
		};
	}

	const user = result.user;

	if (user.type !== "User") {
		return {
			accepted: false,
			reason: `github.com/${user.login} is an ${user.type.toLowerCase()} account, not a person.`,
			answered: true,
		};
	}

	const evidence: Evidence[] = [];
	const named = namesMatch(user.name, person.fullName);

	const employed =
		person.companyName !== null &&
		user.company !== null &&
		looksLikeSameCompany(
			user.company,
			person.companyName,
			person.companyDomain ?? "",
		);

	if (named) {
		const detail = employed
			? `the account is named "${user.name}" and its company reads "${user.company}"`
			: `the account is named "${user.name}"`;
		evidence.push({
			kind: "github.account-identity",
			detail,
			sourceUrl: profile.url,
		});
	} else if (employed) {
		evidence.push({
			kind: "employer-only",
			detail: `its company reads "${user.company}" but the account is named "${user.name ?? "—"}"`,
			sourceUrl: profile.url,
		});
	}

	if (person.companyDomain) {
		const mentions = [user.blog, user.bio]
			.filter((field): field is string => Boolean(field))
			.some((field) =>
				field.toLowerCase().includes(person.companyDomain as string),
			);
		if (mentions) {
			evidence.push({
				kind: "web.cited-claim",
				detail: `the profile links ${person.companyDomain}`,
				sourceUrl: profile.url,
			});
		}
	}

	if (
		nameMatchesLocalPart(
			{ firstName: person.firstName, lastName: person.lastName },
			profile.handle,
		)
	) {
		evidence.push({
			kind: "handle.name-form",
			detail: `the handle "${profile.handle}" is a form of their name`,
			sourceUrl: profile.url,
		});
	}

	if (evidence.length === 0) {
		return {
			accepted: false,
			reason:
				`github.com/${user.login} says nothing connecting it to ${person.fullName}: ` +
				`name "${user.name ?? "—"}", company "${user.company ?? "—"}".`,
			answered: true,
		};
	}

	return { accepted: true, profile, evidence };
}

export async function verifyX(
	profile: SocialProfile,
	person: Person,
): Promise<Verdict> {
	if (
		person.companyName &&
		looksLikeSameCompany(
			profile.handle,
			person.companyName,
			person.companyDomain ?? "",
		)
	) {
		return {
			accepted: false,
			reason: `x.com/${profile.handle} looks like ${person.companyName}'s own account, not ${person.fullName}'s.`,
			answered: false,
		};
	}

	if (
		!nameMatchesLocalPart(
			{ firstName: person.firstName, lastName: person.lastName },
			profile.handle,
		)
	) {
		return {
			accepted: false,
			reason:
				`x.com/${profile.handle} is not a form of "${person.fullName}", and X profiles cannot be read to check. ` +
				"Leave it empty.",
			answered: false,
		};
	}

	const answer = await ask(
		`Is https://x.com/${profile.handle} the X (Twitter) account of ${person.fullName}` +
			`${person.title ? `, ${person.title}` : ""}` +
			`${person.companyName ? ` at ${person.companyName}` : ""}? ` +
			"Answer yes or no and give the profile URL.",
		{ domains: [...socials.domains.x] },
	);

	if (!answer.ok) {
		return {
			accepted: false,
			reason: `Could not corroborate: ${answer.reason}`,
			answered: false,
		};
	}

	const cited = extractSocialUrls(answer.data.citations).some(
		(candidate) =>
			candidate.network === "x" && candidate.handle === profile.handle,
	);

	if (!cited) {
		return {
			accepted: false,
			reason:
				`Nothing retrieved for "${person.fullName}" cites x.com/${profile.handle}. ` +
				"A handle that merely resembles their name is a guess.",
			answered: true,
		};
	}

	return {
		accepted: true,
		profile,
		evidence: [
			{
				kind: "handle.name-form",
				detail: `the handle "${profile.handle}" is a form of their name`,
				sourceUrl: profile.url,
			},
			{
				kind: "search.cites-profile",
				detail: `a search for ${person.fullName} cites this profile`,
				sourceUrl: profile.url,
			},
		],
	};
}

export type SocialSearch =
	| { ok: true; candidates: SocialProfile[]; citations: string[] }
	| { ok: false; reason: string };

export async function findSocialCandidates(
	person: Person,
	network: Network,
): Promise<SocialSearch> {
	const where = network === "x" ? "X (Twitter)" : "GitHub";

	const answer = await ask(
		`What is the ${where} profile of ${person.fullName}` +
			`${person.title ? `, ${person.title}` : ""}` +
			`${person.companyName ? ` at ${person.companyName}` : ""}` +
			`${person.companyDomain ? ` (${person.companyDomain})` : ""}? ` +
			"Reply with the profile URL only, or say you do not know.",
		{ domains: [...socials.domains[network]] },
	);

	if (!answer.ok) return { ok: false, reason: answer.reason };

	const candidates = extractSocialUrls([
		answer.data.text,
		...answer.data.citations,
	]).filter((candidate) => candidate.network === network);

	return { ok: true, candidates, citations: answer.data.citations };
}
