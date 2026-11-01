import type * as React from "react";
import { REPO_URL } from "@/components/site";
import type { Translate } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";
import type { ArticleNavGroup } from "./article";
import {
	type DraftPage,
	draftDocPath,
	draftPath,
	ENTWURF_MAILCHEAP,
} from "./config";
import {
	DraftFooter,
	DraftHeader,
	type DraftLink,
	type FooterGroup,
} from "./shell";
import "./entwurf-mailcheap.css";

const DRAFT = ENTWURF_MAILCHEAP;

export type DraftLinks = Record<DraftPage, DraftLink> & {
	assistants: DraftLink;
	github: DraftLink;
	releases: DraftLink;
};

export function draftLinks(t: Translate): DraftLinks {
	const page = (key: DraftPage, label: string): DraftLink => ({
		href: draftPath(key),
		label,
	});
	return {
		home: page("home", t("Reloop CRM home")),
		docs: page("docs", t("Docs")),
		contact: page("contact", t("Contact")),
		imprint: page("imprint", t("Imprint")),
		pricing: page("pricing", t("Pricing")),
		winBack: page("winBack", t("Win back")),
		openSource: page("openSource", t("Open source")),
		openSourceCrm: page("openSourceCrm", t("Open source CRM")),
		selfHosted: page("selfHosted", t("Self-hosted CRM")),
		vsHubspot: page("vsHubspot", t("Reloop vs HubSpot")),
		about: page("about", t("About")),
		terms: page("terms", t("Terms")),
		privacy: page("privacy", t("Privacy")),
		dpa: page("dpa", t("DPA")),
		signIn: page("signIn", t("Sign in")),
		getStarted: page("getStarted", t("Get started")),
		assistants: {
			href: draftDocPath(DRAFT.docs.assistants),
			label: t("MCP setup"),
		},
		github: { href: REPO_URL, label: DRAFT.brands.github, external: true },
		releases: { href: DRAFT.releases, label: t("Releases"), external: true },
	};
}

export function footerGroups(t: Translate, links: DraftLinks): FooterGroup[] {
	return [
		{
			title: t("Product"),
			links: [links.pricing, links.winBack, links.docs, links.getStarted],
		},
		{
			title: t("Read"),
			links: [
				links.selfHosted,
				links.openSourceCrm,
				links.vsHubspot,
				links.openSource,
			],
		},
		{
			title: t("Company"),
			links: [
				links.about,
				links.contact,
				links.imprint,
				links.terms,
				links.privacy,
				links.dpa,
			],
		},
		{
			title: t("Source"),
			links: [links.github, links.releases, links.signIn],
		},
	];
}

export function articleGroups(
	t: Translate,
	links: DraftLinks,
): ArticleNavGroup[] {
	return [
		{
			title: t("Read"),
			links: [
				links.selfHosted,
				links.openSourceCrm,
				links.vsHubspot,
				links.winBack,
				links.openSource,
			],
		},
		{
			title: t("Company"),
			links: [
				links.about,
				links.contact,
				links.imprint,
				links.terms,
				links.privacy,
				links.dpa,
			],
		},
	];
}

export async function DraftSite({
	note,
	children,
}: {
	note?: React.ReactNode;
	children: React.ReactNode;
}) {
	const t = await getT();
	const links = draftLinks(t);

	return (
		<div className="mc">
			<DraftHeader
				home={links.home}
				links={[
					links.pricing,
					links.winBack,
					links.openSource,
					links.docs,
					links.signIn,
				]}
				start={links.getStarted}
				menu={t("Menu")}
				navLabel={t("Main")}
			/>
			<main>{children}</main>
			<DraftFooter
				home={links.home}
				tagline={t(
					"The open source CRM that reads your email history and tells you which past customers are worth winning back.",
				)}
				note={note}
				groups={footerGroups(t, links)}
				navLabel={t("Footer")}
				legal={t("Reloop CRM. Free software under the GNU AGPL v3.")}
			/>
		</div>
	);
}
