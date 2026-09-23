import { Button } from "@crm/ui/components/button";
import { Link } from "@crm/ui/components/link";
import Wordmark from "@crm/ui/components/wordmark";
import NextLink from "next/link";
import type * as React from "react";
import { getT } from "@/lib/i18n/server";
import { marketingUrl, signInUrl, signUpUrl } from "@/lib/site-links";
import { LanguageSwitcher } from "./language-switcher";
import { REPO_URL } from "./site";

export async function LandingShell({
	cta = true,
	children,
}: {
	cta?: boolean;
	children: React.ReactNode;
}) {
	const t = await getT();

	const productLinks = [
		{ href: marketingUrl("/pricing"), label: t("Pricing") },
		{ href: "/docs", label: t("Docs") },
		{ href: signUpUrl(), label: t("Get started") },
		{ href: signInUrl(), label: t("Sign in") },
	];

	const readingLinks = [
		{ href: marketingUrl("/self-hosted-crm"), label: t("Self-hosted CRM") },
		{ href: marketingUrl("/open-source-crm"), label: t("Open source CRM") },
		{ href: marketingUrl("/vs/hubspot"), label: t("Reloop vs HubSpot") },
		{
			href: marketingUrl("/win-back-customers"),
			label: t("Win back customers"),
		},
		{ href: marketingUrl("/open-source"), label: t("Open source") },
	];

	const companyLinks = [
		{ href: marketingUrl("/about"), label: t("About Reloop CRM") },
		{ href: marketingUrl("/contact"), label: t("Contact") },
		{ href: marketingUrl("/privacy"), label: t("Privacy") },
	];

	return (
		<div className="dark flex min-h-svh w-full flex-col items-center bg-background font-sans text-foreground">
			<header className="sticky top-0 z-10 flex h-16 w-full shrink-0 items-center justify-center border-border border-b bg-background">
				<nav className="flex w-full max-w-(--container-page-wide) items-center gap-4 px-6 text-2sm">
					<NextLink href="/" aria-label={t("Reloop CRM home")}>
						<Wordmark className="h-5 w-auto" />
					</NextLink>
					<div className="grow" />
					<div className="hidden items-center gap-4 sm:flex">
						<Link variant="quiet" href={marketingUrl("/pricing")}>
							{t("Pricing")}
						</Link>
						<Link variant="quiet" href="/docs">
							{t("Docs")}
						</Link>
					</div>
					<Link variant="quiet" href={signInUrl()}>
						{t("Sign in")}
					</Link>
					{cta ? (
						<Button variant="outline" asChild>
							<NextLink href={marketingUrl("/pricing")}>
								{t("Start free trial")}
							</NextLink>
						</Button>
					) : null}
				</nav>
			</header>

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

						<nav className="flex flex-col items-start gap-4 text-2sm">
							{readingLinks.map((link) => (
								<Link variant="quiet" key={link.href} href={link.href}>
									{link.label}
								</Link>
							))}
						</nav>

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
