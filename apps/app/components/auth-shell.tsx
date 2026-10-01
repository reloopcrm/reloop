import Wordmark from "@crm/ui/components/wordmark";
import { cn } from "@crm/ui/lib/utils";
import NextLink from "next/link";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SiteShellMarker } from "@/components/site/site-shell-marker";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { SITE_TYPE } from "@/components/site/typography";
import { getT } from "@/lib/i18n/server";
import { marketingUrl } from "@/lib/site-links";

const CARD_MARKS = [
	"top-0 left-0",
	"top-0 right-0",
	"bottom-0 left-0",
	"right-0 bottom-0",
] as const;

export async function AuthShell({ children }: { children: ReactNode }) {
	const t = await getT();

	return (
		<div className="site relative isolate flex min-h-svh w-full flex-col bg-background text-foreground">
			<SiteShellMarker />
			<i
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(var(--dot)_1px,transparent_1.2px)] bg-size-[var(--site-dot-step)_var(--site-dot-step)] mask-[radial-gradient(ellipse_70%_60%_at_50%_50%,#000,transparent)]"
			/>

			<header className="flex h-(--site-nav-height) w-full shrink-0 items-center justify-between px-(--site-gutter)">
				<NextLink
					href={marketingUrl("/")}
					aria-label={t("Reloop CRM home")}
					className="flex h-10 items-center rounded-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Wordmark className="h-5 w-auto" />
				</NextLink>
				<ThemeToggle />
			</header>

			<main
				id="content"
				className="flex w-full grow items-center justify-center px-(--site-gutter) py-12"
			>
				<div className="relative flex w-full max-w-(--site-auth-width) flex-col gap-8 bg-(--tile) px-6 py-10 sm:px-10 sm:py-12">
					{CARD_MARKS.map((place) => (
						<i
							key={place}
							aria-hidden="true"
							className={cn("absolute size-1 bg-foreground", place)}
						/>
					))}
					{children}
				</div>
			</main>

			<footer className="flex w-full shrink-0 justify-center pb-8 text-muted-foreground">
				<LanguageSwitcher />
			</footer>
		</div>
	);
}

export function AuthHeading({
	title,
	description,
}: {
	title: ReactNode;
	description: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<h1 className={cn(SITE_TYPE.title24, "text-balance")}>{title}</h1>
			<p className={cn(SITE_TYPE.lede, "text-pretty text-(--ink-80)")}>
				{description}
			</p>
		</div>
	);
}
