import type * as React from "react";
import { MARKETING_NAV } from "@/cloud/slots.data";
import {
	type FooterGroup,
	SiteFooter,
	SiteHeader,
	type SiteLink,
} from "@/components/landing/mailcheap/shell";
import { REPO_URL } from "@/components/site";
import { getT } from "@/lib/i18n/server";
import { getImprint } from "@/lib/imprint";
import { marketingUrl, signInUrl, signUpLink } from "@/lib/site-links";

export async function LandingShell({
	cta = true,
	children,
}: {
	cta?: boolean;
	children: React.ReactNode;
}) {
	const t = await getT();

	const marketingLink = (link: { path: string; label: string }): SiteLink => ({
		href: marketingUrl(link.path),
		label: t(link.label),
	});

	const pricing = MARKETING_NAV.pricing
		? marketingLink(MARKETING_NAV.pricing)
		: null;
	const selfHosted = MARKETING_NAV.selfHosted
		? marketingLink(MARKETING_NAV.selfHosted)
		: null;
	const signUp = signUpLink();
	const signIn: SiteLink = { href: signInUrl(), label: t("Sign in") };
	const docs: SiteLink = { href: "/docs", label: t("Docs") };
	const home: SiteLink = {
		href: marketingUrl("/"),
		label: t("Reloop CRM home"),
	};

	const headerLinks = MARKETING_NAV.header?.map(marketingLink) ?? [docs];
	const asideLinks = MARKETING_NAV.headerAside?.map(marketingLink) ?? [];

	const footerGroups: FooterGroup[] = [
		{ title: t("Product"), links: MARKETING_NAV.reading.map(marketingLink) },
		{
			title: t("Pricing"),
			links: [pricing, selfHosted].filter((link) => link !== null),
		},
		{
			title: t("Open source"),
			links: [docs, { href: REPO_URL, label: "GitHub", external: true }],
		},
		{
			title: t("Our company"),
			links: [
				...MARKETING_NAV.company.map(marketingLink),
				signIn,
				...(signUp ? [{ href: signUp, label: t("Get started") }] : []),
			],
		},
	].filter((group) => group.links.length > 0);

	const legalLinks: SiteLink[] = [
		{ href: marketingUrl("/contact"), label: t("Contact") },
		{ href: marketingUrl("/privacy"), label: t("Privacy") },
		...(getImprint()
			? [{ href: marketingUrl("/imprint"), label: t("Imprint") }]
			: []),
	];

	return (
		<div className="mc">
			<a href="#content" className="mc-skip">
				{t("Skip to content")}
			</a>
			<SiteHeader
				home={home}
				links={[...headerLinks, ...asideLinks, signIn]}
				start={
					cta && signUp ? { href: signUp, label: t("Get started") } : undefined
				}
				menu={t("Menu")}
				navLabel={t("Main")}
			/>
			<main id="content">{children}</main>
			<SiteFooter
				home={home}
				tagline={t(
					"The open source CRM that reads your email history and tells you which past customers are worth winning back.",
				)}
				groups={footerGroups}
				navLabel={t("Footer")}
				legal={t("Reloop CRM. Free software under the GNU AGPL v3.")}
				legalLinks={legalLinks}
			/>
		</div>
	);
}
