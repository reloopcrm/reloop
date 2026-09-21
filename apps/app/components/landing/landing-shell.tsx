import { Button } from "@crm/ui/components/button";
import { Link } from "@crm/ui/components/link";
import Wordmark from "@crm/ui/components/wordmark";
import NextLink from "next/link";
import type * as React from "react";
import { getT } from "@/lib/i18n/server";
import { REPO_URL } from "./site";

export async function LandingShell({
	children,
}: {
	children: React.ReactNode;
}) {
	const t = await getT();

	const productLinks = [
		{ href: "/docs", label: t("Docs") },
		{ href: "/get-started", label: t("Get started") },
		{ href: "/sign-in", label: t("Sign in") },
	];

	const readingLinks = [
		{ href: "/self-hosted-crm", label: t("Self-hosted CRM") },
		{ href: "/open-source-crm", label: t("Open source CRM") },
		{ href: "/vs/hubspot", label: t("Reloop vs HubSpot") },
		{ href: "/for/freight-forwarding", label: t("For freight forwarding") },
		{ href: "/open-source", label: t("Open source") },
	];

	const companyLinks = [
		{ href: "/about", label: t("About") },
		{ href: "/contact", label: t("Contact") },
		{ href: "/privacy", label: t("Privacy") },
	];

	return (
		<div className="dark flex min-h-svh w-full flex-col items-center bg-background font-sans text-foreground">
			<header className="sticky top-0 z-10 flex h-16 w-full shrink-0 items-center justify-center border-border border-b bg-background">
				<nav className="flex w-full max-w-(--container-page-wide) items-center gap-4 px-6 text-[13px]/6">
					<NextLink href="/" aria-label={t("Reloop CRM home")}>
						<Wordmark className="h-5 w-auto" />
					</NextLink>
					<div className="grow" />
					<Link variant="quiet" href="/docs">
						{t("Docs")}
					</Link>
					<Link
						variant="quiet"
						href={REPO_URL}
						target="_blank"
						rel="noreferrer"
					>
						GitHub
					</Link>
					<Link variant="quiet" href="/sign-in">
						{t("Sign in")}
					</Link>
					<Button variant="outline" size="sm" asChild>
						<NextLink href="/get-started">{t("Get started")}</NextLink>
					</Button>
				</nav>
			</header>

			{children}

			<footer className="relative flex w-full shrink-0 flex-col items-center border-border border-t">
				<div className="flex w-full max-w-(--container-page-wide) flex-col items-start justify-between gap-12 px-6 py-16 sm:flex-row sm:gap-16">
					<div className="flex shrink-0 flex-col items-start gap-4">
						<Wordmark className="h-5 w-auto" />
						<p className="text-[13px]/[21px] text-muted-foreground">
							{t("The open-source, self-hosted CRM.")}
						</p>
					</div>

					<div className="flex shrink-0 gap-12">
						<nav className="flex flex-col items-start gap-4 text-[13px]/6">
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

						<nav className="flex flex-col items-start gap-4 text-[13px]/6">
							{readingLinks.map((link) => (
								<Link variant="quiet" key={link.href} href={link.href}>
									{link.label}
								</Link>
							))}
						</nav>

						<nav className="flex flex-col items-start gap-4 text-[13px]/6">
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
