"use client";

import Menu from "@carbon/icons-react/es/Menu";
import { Avatar, AvatarFallback } from "@crm/ui/components/avatar";
import { Button } from "@crm/ui/components/button";
import Wordmark from "@crm/ui/components/wordmark";
import Link from "next/link";
import { EnrichmentQueue } from "@/components/enrichment-queue";
import { useMobileNav } from "@/components/mobile-nav";
import {
	type AppUser,
	UserAvatarImage,
	UserMenu,
} from "@/components/user-menu";
import { useT } from "@/lib/i18n/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function AppHeader({ user }: { user: AppUser }) {
	const { setOpen: setMobileNavOpen } = useMobileNav();
	const workspaceUrl = useWorkspaceUrl();
	const t = useT();

	return (
		<header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden [view-transition-name:app-header]">
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("Open navigation")}
				onClick={() => setMobileNavOpen(true)}
			>
				<Menu />
			</Button>
			<Link
				href={workspaceUrl()}
				aria-label={t("Homepage")}
				className="flex h-8 items-center text-foreground"
			>
				<Wordmark className="h-4 w-auto" />
			</Link>

			<div className="ml-auto flex shrink-0 items-center gap-2">
				<EnrichmentQueue />
				<UserMenu user={user}>
					<button
						type="button"
						aria-label={t("Account menu")}
						className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					>
						<UserAvatarImage user={user} size="default" />
					</button>
				</UserMenu>
			</div>
		</header>
	);
}

export function AppHeaderFallback() {
	const t = useT();
	return (
		<header
			className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden [view-transition-name:app-header]"
			aria-busy="true"
		>
			<span className="flex h-8 items-center pl-2 text-foreground">
				<Wordmark className="h-4 w-auto" />
			</span>
			<div className="ml-auto flex shrink-0 items-center gap-2">
				<Avatar>
					<AvatarFallback />
				</Avatar>
			</div>
			<span role="status" className="sr-only">
				{t("Loading workspace header…")}
			</span>
		</header>
	);
}
