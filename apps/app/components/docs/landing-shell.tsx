import { Button } from "@crm/ui/components/button";
import { Link } from "@crm/ui/components/link";
import Wordmark from "@crm/ui/components/wordmark";
import NextLink from "next/link";
import type * as React from "react";
import { MARKETING_NAV } from "@/cloud/slots.data";
import { LanguageSwitcher } from "@/components/language-switcher";
import { REPO_URL } from "@/components/site";
import { getT } from "@/lib/i18n/server";
import { getImprint } from "@/lib/imprint";
import { marketingUrl, signInUrl, signUpLink } from "@/lib/site-links";
import { DynamicIslandNav } from "./dynamic-island-nav";

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

	const signUp = signUpLink();

	const productLinks = [
		...(pricing ? [pricing] : []),
		{ href: "/docs", label: t("Docs") },
		...(signUp ? [{ href: signUp, label: t("Get started") }] : []),
		{ href: signInUrl(), label: t("Sign in") },
	];

	const readingLinks = MARKETING_NAV.reading.map(marketingLink);

	const companyLinks = [
		...MARKETING_NAV.company.map(marketingLink),
		{ href: marketingUrl("/contact"), label: t("Contact") },
		{ href: marketingUrl("/privacy"), label: t("Privacy") },
		...(getImprint()
			? [{ href: marketingUrl("/imprint"), label: t("Imprint") }]
			: []),
	];

	const homeLink = (
		<NextLink href="/" aria-label={t("Reloop CRM home")}>
			<Wordmark className="h-5 w-auto" />
		</NextLink>
	);

	return (
		<div className="dark flex min-h-svh w-full flex-col items-center bg-background font-sans text-foreground">
			<header className="sticky top-0 z-10 flex h-16 w-full shrink-0 items-center justify-center border-border border-b bg-background md:hidden">
				<nav className="flex w-full max-w-(--container-page-wide) items-center gap-4 px-6 text-2sm">
					{homeLink}
					<div className="grow" />
					<div className="hidden items-center gap-4 sm:flex">
						{pricing ? (
							<Link variant="quiet" href={pricing.href}>
								{pricing.label}
							</Link>
						) : null}
						<Link variant="quiet" href="/docs">
							{t("Docs")}
						</Link>
					</div>
					<Link variant="quiet" href={signInUrl()}>
						{t("Sign in")}
					</Link>
					{cta && pricing ? (
						<Button variant="outline" asChild>
							<NextLink href={pricing.href}>{t("Start free trial")}</NextLink>
						</Button>
					) : null}
				</nav>
			</header>
			<div
				aria-hidden="true"
				className="hidden w-full shrink-0 md:block md:h-20"
			/>

			<DynamicIslandNav
				homeLink={homeLink}
				links={
					<>
						{pricing ? (
							<Link variant="quiet" href={pricing.href}>
								{pricing.label}
							</Link>
						) : null}
						<Link variant="quiet" href="/docs">
							{t("Docs")}
						</Link>
						<Link variant="quiet" href={signInUrl()}>
							{t("Sign in")}
						</Link>
					</>
				}
				cta={
					cta && pricing ? (
						<Button variant="outline" size="sm" asChild>
							<NextLink href={pricing.href}>{t("Start free trial")}</NextLink>
						</Button>
					) : null
				}
				language={<LanguageSwitcher />}
			/>

			{children}

			<footer className="relative flex w-full shrink-0 flex-col items-center border-border border-t">
				<div className="flex w-full max-w-(--container-page-wide) flex-col items-start justify-between gap-12 px-6 py-16 sm:flex-row sm:gap-16">
					<div className="flex shrink-0 flex-col items-start gap-4">
						<Wordmark className="h-5 w-auto" />
						<p className="text-2sm text-muted-foreground">
							{t("The CRM that wins old customers back.")}
						</p>
						<div className="text-muted-foreground">
							<LanguageSwitcher />
						</div>
					</div>

					<div className="flex max-w-full shrink-0 flex-wrap gap-12">
						<nav className="flex flex-col items-start gap-4 text-2sm">
							{productLinks.map((link) => (
								<Link variant="quiet" key={link.href} href={link.href}>
									{link.label}
								</Link>
							))}
							<Link
								variant="quiet"
								href={REPO_URL}
								target="_blank"
								rel="noreferrer"
							>
								GitHub
							</Link>
						</nav>

						{readingLinks.length > 0 ? (
							<nav className="flex flex-col items-start gap-4 text-2sm">
								{readingLinks.map((link) => (
									<Link variant="quiet" key={link.href} href={link.href}>
										{link.label}
									</Link>
								))}
							</nav>
						) : null}

						<nav className="flex flex-col items-start gap-4 text-2sm">
							{companyLinks.map((link) => (
								<Link variant="quiet" key={link.href} href={link.href}>
									{link.label}
								</Link>
							))}
						</nav>
					</div>
				</div>
			</footer>
		</div>
	);
}
