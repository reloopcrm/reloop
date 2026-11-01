import { MARKETING_NAV } from "@/cloud/slots.data";
import { REPO_URL } from "@/components/site";
import type { Translate } from "@/lib/i18n/locale";
import { getImprint } from "@/lib/imprint";
import { marketingUrl, signInUrl } from "@/lib/site-links";
import type { ArticleNavGroup } from "./article";
import { LANDING, type LandingPage } from "./config";
import type { SiteLink } from "./shell";

export type SiteLinks = Record<LandingPage, SiteLink> & {
	github: SiteLink;
	releases: SiteLink;
};

export function siteLinks(t: Translate): SiteLinks {
	const page = (key: LandingPage, label: string): SiteLink => ({
		href: marketingUrl(LANDING.pages[key]),
		label,
	});
	return {
		home: page("home", t("Reloop CRM home")),
		docs: { href: LANDING.pages.docs, label: t("Docs") },
		contact: page("contact", t("Contact")),
		imprint: page("imprint", t("Imprint")),
		privacy: page("privacy", t("Privacy")),
		signIn: { href: signInUrl(), label: t("Sign in") },
		github: { href: REPO_URL, label: LANDING.brands.github, external: true },
		releases: { href: LANDING.releases, label: t("Releases"), external: true },
	};
}

export function legalLinks(links: SiteLinks): SiteLink[] {
	return [
		links.contact,
		links.privacy,
		...(getImprint() ? [links.imprint] : []),
	];
}

export function companyLinks(t: Translate): SiteLink[] {
	return MARKETING_NAV.company.map((link) => ({
		href: marketingUrl(link.path),
		label: t(link.label),
	}));
}

export function articleGroups(
	t: Translate,
	links: SiteLinks,
): ArticleNavGroup[] {
	return [
		{ title: t("Docs"), links: [links.docs, links.github] },
		{
			title: t("Company"),
			links: [...companyLinks(t), ...legalLinks(links)],
		},
	];
}
