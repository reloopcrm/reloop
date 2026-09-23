"use client";

import Building from "@carbon/icons-react/es/Building";
import ChatBot from "@carbon/icons-react/es/ChatBot";
import Close from "@carbon/icons-react/es/Close";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import Partnership from "@carbon/icons-react/es/Partnership";
import Renew from "@carbon/icons-react/es/Renew";
import Settings from "@carbon/icons-react/es/Settings";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import Wordmark from "@crm/ui/components/wordmark";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { AgentBuilderSidebar } from "@/components/agent-builder/agent-builder-sidebar";
import { usePrefetchSection } from "@/components/crm/section-prefetch";
import { EnrichmentQueue } from "@/components/enrichment-queue";
import { useMobileNav } from "@/components/mobile-nav";
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
	icon: CarbonIcon;
	match: "exact" | "prefix";
	related?: string[];
	transition: "nav-lateral" | "nav-forward";
};

const MAIN: NavItem[] = [
	{
		title: "Overview",
		href: "/",
		icon: Dashboard,
		match: "exact",
		transition: "nav-lateral",
	},
	{
		title: "Win back",
		href: "/win-back",
		icon: Renew,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Companies",
		href: "/companies",
		icon: Building,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Contacts",
		href: "/contacts",
		icon: UserMultiple,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Deals",
		href: "/deals",
		icon: Partnership,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Chat",
		href: "/chat",
		icon: ChatBot,
		match: "prefix",
		related: ["/agents"],
		transition: "nav-forward",
	},
];

const SETTINGS: NavItem = {
	title: "Settings",
	href: "/settings",
	icon: Settings,
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
	labelled,
	onNavigate,
	onPrefetch,
}: {
	item: NavItem;
	active: boolean;
	alert?: string;
	count?: number;
	labelled: boolean;
	onNavigate?: () => void;
	onPrefetch: () => void;
}) {
	const t = useT();
	const locale = useLocale();
	const counted = count ? numberFormat(locale).format(count) : null;
	const link = (
		<Button
			asChild
			variant="nav"
			className={
				labelled
					? "w-full px-3"
					: "w-full px-3 max-lg:justify-center max-lg:px-0"
			}
		>
			<Link
				href={item.href}
				prefetch
				onMouseEnter={onPrefetch}
				onFocus={onPrefetch}
				onClick={onNavigate}
				aria-current={active ? "page" : undefined}
				transitionTypes={[item.transition]}
				className="relative"
			>
				<Icon icon={item.icon} />
				<span className={labelled ? "truncate" : "hidden truncate lg:inline"}>
					{t(item.title)}
				</span>
				{counted ? (
					<span
						className={
							labelled
								? "ml-auto text-muted-foreground text-xs tabular-nums"
								: "ml-auto hidden text-muted-foreground text-xs tabular-nums lg:inline"
						}
					>
						{counted}
					</span>
				) : null}
				{alert ? (
					<span
						aria-hidden="true"
						className="absolute top-2 right-2 size-1.5 rounded-full bg-info"
					/>
				) : null}
				{alert ? <span className="sr-only">{alert}</span> : null}
			</Link>
		</Button>
	);

	if (labelled) return link;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{link}</TooltipTrigger>
			<TooltipContent side="right" className="lg:hidden">
				{t(item.title)}
				{counted ? ` · ${counted}` : null}
				{alert ? ` · ${alert}` : null}
			</TooltipContent>
		</Tooltip>
	);
}

function BrandMark() {
	return (
		<Image
			src="/favicon.svg"
			alt=""
			width={28}
			height={28}
			unoptimized
			className="size-7 rounded-md lg:hidden"
		/>
	);
}

function Brand({ workspaceName }: { workspaceName: string }) {
	const workspaceUrl = useWorkspaceUrl();
	const t = useT();
	return (
		<div className="flex h-9 items-center gap-2.5 px-3 pb-5 max-lg:justify-center max-lg:px-0">
			<Link
				href={workspaceUrl()}
				aria-label={t("Homepage")}
				className="flex shrink-0 items-center text-foreground"
			>
				<Wordmark className="hidden h-4.5 w-auto lg:block" />
				<BrandMark />
			</Link>
			<span className="ml-auto hidden min-w-0 truncate text-muted-foreground text-xs lg:inline">
				{workspaceName}
			</span>
		</div>
	);
}

export function AppSidebarFallback() {
	const t = useT();
	return (
		<nav
			aria-label={t("Primary")}
			aria-busy="true"
			className="hidden w-(--container-rail) shrink-0 flex-col border-r bg-sidebar px-2 pt-5 pb-4 md:flex lg:w-(--container-sidebar) lg:px-3 [view-transition-name:app-rail]"
		>
			<div className="flex h-9 items-center px-3 pb-5 max-lg:justify-center max-lg:px-0">
				<span className="flex items-center text-foreground">
					<Wordmark className="hidden h-4.5 w-auto lg:block" />
					<BrandMark />
				</span>
			</div>
			<div className="flex flex-col gap-0.5">
				{MAIN.map((item) => (
					<Button
						key={item.href}
						variant="nav"
						disabled
						className="w-full px-3 max-lg:justify-center max-lg:px-0"
					>
						<Icon icon={item.icon} />
						<span className="hidden lg:inline">{t(item.title)}</span>
					</Button>
				))}
			</div>
		</nav>
	);
}

export function AppSidebar({
	managed,
	workspaceName,
	user,
}: {
	managed: boolean;
	workspaceName: string;
	user: AppUser;
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
	const winBackCount = winBack.data?.people ?? 0;
	const updateReady = !managed && version.data?.updateAvailable === true;
	const updateAlert = updateReady ? t("Update available") : undefined;
	const inChat = items.some(
		(item) => item.title === "Chat" && isActive(item, pathname),
	);

	const list = (labelled: boolean, onNavigate?: () => void) => (
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
						labelled={labelled}
						onNavigate={onNavigate}
						onPrefetch={() => prefetchSection(item.section)}
					/>
				))}
			</div>
			<div className="mt-auto flex flex-col gap-0.5 pt-4">
				<NavLink
					item={settings}
					active={isActive(settings, pathname)}
					alert={updateAlert}
					labelled={labelled}
					onNavigate={onNavigate}
					onPrefetch={() => prefetchSection(settings.section)}
				/>
			</div>
		</>
	);

	return (
		<>
			<nav
				aria-label={t("Primary")}
				className="hidden w-(--container-rail) shrink-0 flex-col border-r bg-sidebar px-2 pt-5 pb-4 md:flex lg:w-(--container-sidebar) lg:px-3 [view-transition-name:app-rail]"
			>
				<Brand workspaceName={workspaceName} />
				{list(false)}
				<div className="mt-2 flex flex-col gap-2 border-t pt-3">
					<div className="hidden lg:flex">
						<EnrichmentQueue />
					</div>
					<UserMenu user={user} align="start">
						<button
							type="button"
							aria-label={t("Account menu")}
							className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-full px-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 max-lg:justify-center max-lg:px-0"
						>
							<UserAvatarImage user={user} size="sm" />
							<span className="hidden min-w-0 truncate text-2sm text-body-foreground lg:inline">
								{user.name}
							</span>
						</button>
					</UserMenu>
				</div>
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
							<Button
								variant="ghost"
								size="icon"
								aria-label={t("Close navigation")}
								onClick={() => setOpen(false)}
							>
								<Icon icon={Close} />
							</Button>
							<div className="my-1 h-px w-5 bg-border" />
							{items.map((item) => (
								<Button key={item.href} asChild variant="nav" size="icon">
									<Link
										href={item.href}
										prefetch
										aria-current={isActive(item, pathname) ? "page" : undefined}
										onClick={() => setOpen(false)}
									>
										<Icon icon={item.icon} />
										<span className="sr-only">{t(item.title)}</span>
									</Link>
								</Button>
							))}
						</nav>
						<AgentBuilderSidebar
							className="flex flex-1"
							onNavigate={() => setOpen(false)}
						/>
					</SheetContent>
				) : (
					<SheetContent side="left" className="w-64 gap-0 p-0">
						<SheetHeader>
							<SheetTitle>{t("Navigation")}</SheetTitle>
						</SheetHeader>
						<nav
							aria-label={t("Primary")}
							className="flex flex-1 flex-col px-3 pb-4"
						>
							{list(true, () => setOpen(false))}
						</nav>
					</SheetContent>
				)}
			</Sheet>
		</>
	);
}
