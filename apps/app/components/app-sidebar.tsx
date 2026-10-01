"use client";

import { Button } from "@crm/ui/components/button";
import { MonoLabel, Square } from "@crm/ui/components/mark";
import {
	ChatIcon,
	CompaniesIcon,
	ContactsIcon,
	DealsIcon,
	OverviewIcon,
	SettingsIcon,
	WinBackIcon,
} from "@crm/ui/components/nav-icons";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import Wordmark from "@crm/ui/components/wordmark";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { AgentBuilderSidebar } from "@/components/agent-builder/agent-builder-sidebar";
import { usePrefetchSection } from "@/components/crm/section-prefetch";
import { EnrichmentQueue } from "@/components/enrichment-queue";
import { useMobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import {
	type AppUser,
	UserAvatarImage,
	UserMenu,
} from "@/components/user-menu";
import { useLocale, useT } from "@/lib/i18n/client";
import { numberFormat } from "@/lib/i18n/format";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type NavItem = {
	title: string;
	href: string;
	icon: ComponentType<{ "aria-hidden"?: boolean }>;
	match: "exact" | "prefix";
	related?: string[];
	transition: "nav-lateral" | "nav-forward";
};

const MAIN: NavItem[] = [
	{
		title: "Overview",
		href: "/",
		icon: OverviewIcon,
		match: "exact",
		transition: "nav-lateral",
	},
	{
		title: "Win back",
		href: "/win-back",
		icon: WinBackIcon,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Companies",
		href: "/companies",
		icon: CompaniesIcon,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Contacts",
		href: "/contacts",
		icon: ContactsIcon,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Deals",
		href: "/deals",
		icon: DealsIcon,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Chat",
		href: "/chat",
		icon: ChatIcon,
		match: "prefix",
		related: ["/agents"],
		transition: "nav-forward",
	},
];

const SETTINGS: NavItem = {
	title: "Settings",
	href: "/settings",
	icon: SettingsIcon,
	match: "prefix",
	transition: "nav-lateral",
};

const ITEMS: NavItem[] = [...MAIN, SETTINGS];

const MINUTE_MS = 60 * 1000;

const SIDEBAR = {
	versionStaleMs: 30 * MINUTE_MS,
	winBack: { section: "/win-back", staleMs: 5 * MINUTE_MS, pageSize: 1 },
} as const;

function isActive(item: NavItem, pathname: string): boolean {
	return (
		pathname === item.href ||
		(item.match === "prefix" && pathname.startsWith(item.href)) ||
		Boolean(item.related?.some((prefix) => pathname.startsWith(prefix)))
	);
}

function NavLink({
	item,
	active,
	alert,
	count,
	onNavigate,
	onPrefetch,
}: {
	item: NavItem;
	active: boolean;
	alert?: string;
	count?: number;
	onNavigate?: () => void;
	onPrefetch: () => void;
}) {
	const t = useT();
	const locale = useLocale();
	const counted = count ? numberFormat(locale).format(count) : null;
	const Glyph = item.icon;

	return (
		<Button asChild variant="nav" className="w-full">
			<Link
				href={item.href}
				prefetch
				onMouseEnter={onPrefetch}
				onFocus={onPrefetch}
				onClick={onNavigate}
				aria-current={active ? "page" : undefined}
				transitionTypes={[item.transition]}
			>
				<Glyph aria-hidden />
				<span className="truncate">{t(item.title)}</span>
				{counted ? <MonoLabel className="ml-auto">{counted}</MonoLabel> : null}
				{alert ? (
					<span
						aria-hidden="true"
						className="ml-auto size-1.5 rounded-full bg-blue"
					/>
				) : null}
				{alert ? <span className="sr-only">{alert}</span> : null}
			</Link>
		</Button>
	);
}

function WorkspaceName() {
	const trpc = useTRPC();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const name = workspace.data?.name;

	if (!name) return null;

	return (
		<div className="flex min-w-0 items-center gap-2 px-2 pt-1.5 pb-3.5">
			<Square tone="blue" />
			<MonoLabel className="truncate">{name}</MonoLabel>
		</div>
	);
}

function Brand() {
	const workspaceUrl = useWorkspaceUrl();
	const t = useT();
	return (
		<div className="flex h-9 items-center px-2">
			<Link
				href={workspaceUrl()}
				aria-label={t("Homepage")}
				className="flex shrink-0 items-center text-foreground"
			>
				<Wordmark className="h-4.5 w-auto" />
			</Link>
		</div>
	);
}

function AccountRow({ user, plan }: { user: AppUser; plan?: string | null }) {
	const t = useT();
	return (
		<div className="flex h-8 items-center gap-1">
			<UserMenu user={user} align="start">
				<Button
					variant="nav"
					aria-label={t("Account menu")}
					className="min-w-0 flex-1"
				>
					<UserAvatarImage user={user} size="sm" />
					<span className="truncate">{user.name}</span>
					{plan ? <MonoLabel className="ml-auto">{t(plan)}</MonoLabel> : null}
				</Button>
			</UserMenu>
			<ThemeToggle />
		</div>
	);
}

export function AppSidebarFallback() {
	const t = useT();
	return (
		<nav
			aria-label={t("Primary")}
			aria-busy="true"
			className="hidden w-(--container-sidebar) shrink-0 flex-col border-r bg-sidebar px-3 pt-4 pb-3 lg:flex [view-transition-name:app-rail]"
		>
			<div className="flex h-9 items-center px-2">
				<Wordmark className="h-4.5 w-auto text-foreground" />
			</div>
			<div className="flex flex-col gap-0.5 pt-6">
				{MAIN.map((item) => {
					const Glyph = item.icon;
					return (
						<Button key={item.href} variant="nav" disabled className="w-full">
							<Glyph aria-hidden />
							<span>{t(item.title)}</span>
						</Button>
					);
				})}
			</div>
		</nav>
	);
}

export function AppSidebar({
	managed,
	user,
	plan,
}: {
	managed: boolean;
	user: AppUser;
	plan?: string | null;
}) {
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();
	const { open, setOpen } = useMobileNav();
	const prefetchSection = usePrefetchSection();
	const trpc = useTRPC();
	const t = useT();

	const items = useMemo(
		() =>
			ITEMS.map((item) => ({
				...item,
				section: item.href,
				href: workspaceUrl(item.href),
				related: item.related?.map((path) => workspaceUrl(path)),
			})),
		[workspaceUrl],
	);
	const main = items.slice(0, MAIN.length);
	const settings = items[MAIN.length] as (typeof items)[number];
	const version = useQuery({
		...trpc.system.version.queryOptions(),
		staleTime: SIDEBAR.versionStaleMs,
	});
	const winBack = useQuery({
		...trpc.reactivation.list.queryOptions({
			pageSize: SIDEBAR.winBack.pageSize,
		}),
		staleTime: SIDEBAR.winBack.staleMs,
	});
	const winBackCount = winBack.data?.total ?? 0;
	const updateReady = !managed && version.data?.updateAvailable === true;
	const updateAlert = updateReady ? t("Update available") : undefined;
	const inChat = items.some(
		(item) => item.title === "Chat" && isActive(item, pathname),
	);

	const body = (onNavigate?: () => void) => (
		<>
			<div className="flex flex-col gap-0.5">
				{main.map((item) => (
					<NavLink
						key={item.href}
						item={item}
						active={isActive(item, pathname)}
						count={
							item.section === SIDEBAR.winBack.section
								? winBackCount
								: undefined
						}
						onNavigate={onNavigate}
						onPrefetch={() => prefetchSection(item.section)}
					/>
				))}
			</div>
			<div className="mt-auto flex flex-col gap-0.5 border-t pt-2.5">
				<NavLink
					item={settings}
					active={isActive(settings, pathname)}
					alert={updateAlert}
					onNavigate={onNavigate}
					onPrefetch={() => prefetchSection(settings.section)}
				/>
				<EnrichmentQueue />
				<AccountRow user={user} plan={plan} />
			</div>
		</>
	);

	return (
		<>
			<nav
				aria-label={t("Primary")}
				className="hidden w-(--container-sidebar) shrink-0 flex-col border-r bg-sidebar px-3 pt-4 pb-3 lg:flex [view-transition-name:app-rail]"
			>
				<Brand />
				<WorkspaceName />
				{body()}
			</nav>

			<Sheet open={open} onOpenChange={setOpen}>
				{inChat ? (
					<SheetContent
						side="left"
						showCloseButton={false}
						className="w-5/6 max-w-sm flex-row gap-0 p-0"
					>
						<SheetHeader className="sr-only">
							<SheetTitle>{t("Navigation and agent chats")}</SheetTitle>
						</SheetHeader>
						<nav
							aria-label={t("Primary")}
							className="flex w-(--container-rail) shrink-0 flex-col items-center gap-1 border-r px-2 py-3"
						>
							{items.map((item) => {
								const Glyph = item.icon;
								return (
									<Button key={item.href} asChild variant="nav" size="icon">
										<Link
											href={item.href}
											prefetch
											aria-current={
												isActive(item, pathname) ? "page" : undefined
											}
											onClick={() => setOpen(false)}
										>
											<Glyph aria-hidden />
											<span className="sr-only">{t(item.title)}</span>
										</Link>
									</Button>
								);
							})}
						</nav>
						<AgentBuilderSidebar
							className="flex flex-1"
							onNavigate={() => setOpen(false)}
						/>
					</SheetContent>
				) : (
					<SheetContent side="left" className="w-72 gap-0 p-0">
						<SheetHeader className="px-3 pb-0">
							<SheetTitle className="sr-only">{t("Navigation")}</SheetTitle>
							<WorkspaceName />
						</SheetHeader>
						<nav
							aria-label={t("Primary")}
							className="flex flex-1 flex-col px-3 pb-3"
						>
							{body(() => setOpen(false))}
						</nav>
					</SheetContent>
				)}
			</Sheet>
		</>
	);
}
