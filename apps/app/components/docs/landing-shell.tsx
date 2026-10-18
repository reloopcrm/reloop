import { Button } from "@crm/ui/components/button";
import Wordmark from "@crm/ui/components/wordmark";
import { cn } from "@crm/ui/lib/utils";
import NextLink from "next/link";
import type * as React from "react";
import { MARKETING_NAV } from "@/cloud/slots.data";
import { LanguageSwitcher } from "@/components/language-switcher";
import { REPO_URL } from "@/components/site";
import { Banner } from "@/components/site/banner";
import { NavSheet } from "@/components/site/nav-sheet";
import { SiteShellMarker } from "@/components/site/site-shell-marker";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { SITE_TYPE } from "@/components/site/typography";
import { getT } from "@/lib/i18n/server";
import { getImprint } from "@/lib/imprint";
import { marketingUrl, signInUrl, signUpLink } from "@/lib/site-links";

type ShellLink = { href: string; label: string; external?: boolean };

type FooterGroup = { title: string; links: ShellLink[] };

const NAV_LINK =
	"inline-flex h-10 items-center rounded-md px-3 text-(length:--site-text-body) text-foreground outline-none transition-colors hover:text-(--ink-60) focus-visible:ring-2 focus-visible:ring-ring max-[1100px]:px-2";

const FOOTER_TITLE = cn(
	SITE_TYPE.mono,
	"font-(--site-weight-medium) text-(--ink-60) tracking-[0.1em]",
);

function FooterLinks({ links }: { links: readonly ShellLink[] }) {
	return (
		<ul className="mb-8 flex flex-col gap-3 text-(length:--site-text-small) leading-tight max-[900px]:mb-4">
			{links.map((link) => (
				<li key={link.href}>
					<NextLink
						href={link.href}
						className={FOOTER_LINK}
						target={link.external ? "_blank" : undefined}
						rel={link.external ? "noreferrer" : undefined}
					>
						{link.label}
					</NextLink>
				</li>
			))}
		</ul>
	);
}

const FOOTER_LINK =
	"rounded-xs outline-none transition-colors hover:text-(--ink-60) focus-visible:ring-2 focus-visible:ring-ring";

export async function LandingShell({
	cta = true,
	children,
}: {
	cta?: boolean;
	children: React.ReactNode;
}) {
	const t = await getT();

	const marketingLink = (link: { path: string; label: string }) => ({
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
	const signIn = { href: signInUrl(), label: t("Sign in") };
	const docs = { href: "/docs", label: t("Docs") };

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

	const legalLinks = [
		{ href: marketingUrl("/contact"), label: t("Contact") },
		{ href: marketingUrl("/privacy"), label: t("Privacy") },
		...(getImprint()
			? [{ href: marketingUrl("/imprint"), label: t("Imprint") }]
			: []),
	];

	return (
		<div className="site flex min-h-svh w-full flex-col bg-background text-foreground">
			<SiteShellMarker />
			<a
				href="#content"
				className="sr-only rounded-xs bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:outline-none focus:ring-2 focus:ring-ring"
			>
				{t("Skip to content")}
			</a>

			<header className="sticky top-0 z-40 w-full shrink-0">
				{pricing ? (
					<Banner link={{ ...pricing, label: t("See the plans") }} />
				) : null}

				<nav
					aria-label={t("Main")}
					className="flex h-(--site-nav-height) items-center bg-background px-(--site-gutter)"
				>
					<NextLink
						href={marketingUrl("/")}
						aria-label={t("Reloop CRM home")}
						className="me-4 flex h-10 items-center rounded-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<Wordmark className="h-5 w-auto" />
					</NextLink>

					<ul className="hidden items-center min-[901px]:flex">
						{headerLinks.map((link) => (
							<li key={link.href}>
								<NextLink href={link.href} className={NAV_LINK}>
									{link.label}
								</NextLink>
							</li>
						))}
					</ul>

					<div className="ms-auto flex items-center">
						<NextLink
							href={signIn.href}
							className={cn(NAV_LINK, "hidden min-[901px]:inline-flex")}
						>
							{signIn.label}
						</NextLink>
						{cta && signUp ? (
							<Button size="sm" className="ms-3" asChild>
								<NextLink href={signUp}>{t("Get started")}</NextLink>
							</Button>
						) : null}
						<span className="ms-2 flex">
							<ThemeToggle />
						</span>
						<NavSheet links={[...headerLinks, ...asideLinks, signIn]} />
					</div>
				</nav>
			</header>

			<main id="content" className="flex w-full grow flex-col items-center">
				{children}
			</main>

			<footer className="w-full shrink-0 pt-(--site-footer-top) pb-10 max-[900px]:pb-8">
				<div className={SITE_TYPE.container}>
					<div className="grid gap-8 max-[900px]:gap-0 min-[901px]:grid-cols-5">
						{footerGroups.map((group) => (
							<div key={group.title}>
								<div className="hidden min-[901px]:block">
									<p className={cn(FOOTER_TITLE, "mb-4")}>{group.title}</p>
									<FooterLinks links={group.links} />
								</div>
								<details className="group border-border border-b min-[901px]:hidden">
									<summary className="flex cursor-pointer list-none items-center justify-between rounded-xs py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
										<span className={cn(FOOTER_TITLE, "text-foreground")}>
											{group.title}
										</span>
										<span
											aria-hidden="true"
											className="size-0 border-x-6 border-x-transparent border-t-8 border-t-foreground group-open:rotate-180"
										/>
									</summary>
									<FooterLinks links={group.links} />
								</details>
							</div>
						))}
					</div>

					<div className="mt-(--site-footer-bottom-gap) flex flex-wrap items-center gap-4 text-(--ink-60) text-(length:--site-text-small)">
						{legalLinks.map((link) => (
							<NextLink
								key={link.href}
								href={link.href}
								className={FOOTER_LINK}
							>
								{link.label}
							</NextLink>
						))}
						<div className="ms-auto">
							<LanguageSwitcher />
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}
