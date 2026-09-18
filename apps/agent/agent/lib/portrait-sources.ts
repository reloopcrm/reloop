export type PortraitSource = "github";

export type PortraitCandidate = {
	source: PortraitSource;
	url: string;
};

export type PortraitSubject = {
	id: string;
	name: string | null;
	githubUrl: string | null;
};

export function findPortrait(
	subject: PortraitSubject,
):
	| { found: true; candidate: PortraitCandidate }
	| { found: false; tried: string[] } {
	const login = githubLogin(subject.githubUrl);

	if (!login) return { found: false, tried: [] };

	return {
		found: true,
		candidate: {
			source: "github",
			url: `https://github.com/${encodeURIComponent(login)}.png?size=460`,
		},
	};
}

function githubLogin(raw: string | null): string | null {
	if (!raw) return null;

	try {
		const url = new URL(raw.trim());
		const host = url.hostname.toLowerCase().replace(/^www\./, "");
		if (host !== "github.com") return null;

		const segments = url.pathname.split("/").filter(Boolean);
		if (segments.length !== 1) return null;

		return segments[0] ?? null;
	} catch {
		return null;
	}
}
