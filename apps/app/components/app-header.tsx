"use client";

import Asleep from "@carbon/icons-react/es/Asleep";
import Light from "@carbon/icons-react/es/Light";
import Logout from "@carbon/icons-react/es/Logout";
import Menu from "@carbon/icons-react/es/Menu";
import UserAvatar from "@carbon/icons-react/es/UserAvatar";
import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import Wordmark from "@crm/ui/components/wordmark";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { EnrichmentQueue } from "@/components/enrichment-queue";
import { useMobileNav } from "@/components/mobile-nav";
import { useT } from "@/lib/i18n/client";
import { signOutAndRedirect } from "@/lib/sign-out";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type User = { name: string; email: string; image: string | null };

export function AppHeader({ user }: { user: User }) {
	const { setOpen: setMobileNavOpen } = useMobileNav();
	const workspaceUrl = useWorkspaceUrl();
	const t = useT();

	return (
		<header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 [view-transition-name:app-header]">
			<div className="flex shrink-0 items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					className="md:hidden"
					aria-label={t("Open navigation")}
					onClick={() => setMobileNavOpen(true)}
				>
					<Menu />
				</Button>
				<Link
					href={workspaceUrl()}
					aria-label={t("Homepage")}
					className="hidden h-8 items-center text-foreground md:flex"
				>
					<Wordmark className="h-4 w-auto" />
				</Link>
			</div>

			<div className="ml-auto flex shrink-0 items-center gap-2">
				<EnrichmentQueue />
				<UserMenu
					user={user}
					onSignOut={() => {
						signOutAndRedirect().catch(() =>
							toast.error(t("Could not sign out.")),
						);
					}}
				/>
			</div>
		</header>
	);
}

export function AppHeaderFallback() {
	const t = useT();
	return (
		<header
			className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 [view-transition-name:app-header]"
			aria-busy="true"
		>
			<div className="flex shrink-0 items-center gap-2">
				<span className="hidden h-8 items-center text-foreground md:flex">
					<Wordmark className="h-4 w-auto" />
				</span>
			</div>

			<div className="ml-auto flex shrink-0 items-center gap-2">
				<Avatar className="size-7">
					<AvatarFallback />
				</Avatar>
			</div>
			<span role="status" className="sr-only">
				{t("Loading workspace header…")}
			</span>
		</header>
	);
}

function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";
	const t = useT();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={t("Account menu")}
					className="hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
				>
					<Avatar className="size-7">
						{user.image && <AvatarImage alt={user.name} src={user.image} />}
						<AvatarFallback className="text-xs">
							{initials(user.name)}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuLabel className="flex items-center gap-2">
					<UserAvatar />
					<span className="min-w-0 truncate">{user.email}</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={(event) => {
						event.preventDefault();
						setTheme(isDark ? "light" : "dark");
					}}
				>
					{isDark ? <Light /> : <Asleep />}
					{isDark ? t("Light mode") : t("Dark mode")}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onSignOut}>
					<Logout />
					{t("Sign out")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function initials(name: string): string {
	return (
		name
			.split(" ")
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}
