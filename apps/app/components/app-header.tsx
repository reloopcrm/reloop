"use client";

import { Button } from "@crm/ui/components/button";
import { MenuIcon } from "@crm/ui/components/nav-icons";
import Wordmark from "@crm/ui/components/wordmark";
import Link from "next/link";
import { useMobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { useT } from "@/lib/i18n/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const HEADER =
	"flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar pr-3 pl-4 lg:hidden [view-transition-name:app-header]";

export function AppHeader() {
	const { setOpen: setMobileNavOpen } = useMobileNav();
	const workspaceUrl = useWorkspaceUrl();
	const t = useT();

	return (
		<header className={HEADER}>
			<Link
				href={workspaceUrl()}
				aria-label={t("Homepage")}
				className="flex h-8 flex-1 items-center text-foreground"
			>
				<Wordmark className="h-4 w-auto" />
			</Link>
			<ThemeToggle />
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("Open navigation")}
				onClick={() => setMobileNavOpen(true)}
			>
				<MenuIcon aria-hidden />
			</Button>
		</header>
	);
}

export function AppHeaderFallback() {
	const t = useT();
	return (
		<header className={HEADER} aria-busy="true">
			<span className="flex h-8 flex-1 items-center text-foreground">
				<Wordmark className="h-4 w-auto" />
			</span>
			<span role="status" className="sr-only">
				{t("Loading workspace header…")}
			</span>
		</header>
	);
}
