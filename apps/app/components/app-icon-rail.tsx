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
import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useMemo } from "react";
import { AgentBuilderSidebar } from "@/components/agent-builder/agent-builder-sidebar";
import { usePrefetchSection } from "@/components/crm/section-prefetch";
import { useMobileNav } from "@/components/mobile-nav";
import { useT } from "@/lib/i18n/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type RailItem = {
	title: string;
	href: string;
	icon: CarbonIcon;
	match: "exact" | "prefix";
	related?: string[];
};

const GROUPS: RailItem[][] = [
	[
		{ title: "Overview", href: "/", icon: Dashboard, match: "exact" },
		{
			title: "Chat",
			href: "/chat",
			icon: ChatBot,
			match: "prefix",
			related: ["/agents"],
		},
	],
	[
		{ title: "Companies", href: "/companies", icon: Building, match: "prefix" },
		{
			title: "Contacts",
			href: "/contacts",
			icon: UserMultiple,
			match: "prefix",
		},
		{ title: "Deals", href: "/deals", icon: Partnership, match: "prefix" },
	],
	[{ title: "Win back", href: "/win-back", icon: Renew, match: "prefix" }],
	[{ title: "Settings", href: "/settings", icon: Settings, match: "prefix" }],
];

const ITEMS: RailItem[] = GROUPS.flat();

function isActive(item: RailItem, pathname: string): boolean {
	return (
		pathname === item.href ||
		(item.match === "prefix" && pathname.startsWith(item.href)) ||
		Boolean(item.related?.some((prefix) => pathname.startsWith(prefix)))
	);
}

function RailLink({
	item,
	active,
	onPrefetch,
}: {
	item: RailItem;
	active: boolean;
	onPrefetch: () => void;
}) {
	const t = useT();
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					asChild
					variant="ghost"
					size="icon"
					className={cn(
						"relative shrink-0 text-muted-foreground",
						active && "text-foreground hover:text-foreground",
					)}
				>
					<Link
						href={item.href}
						prefetch
						onMouseEnter={onPrefetch}
						onFocus={onPrefetch}
						aria-current={active ? "page" : undefined}
						transitionTypes={["nav-lateral"]}
					>
						{active ? (
							<span
								aria-hidden="true"
								className="absolute inset-y-1 -left-2 w-0.5 rounded-full bg-primary"
							/>
						) : null}
						<Icon icon={item.icon} />
						<span className="sr-only">{t(item.title)}</span>
					</Link>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">{t(item.title)}</TooltipContent>
		</Tooltip>
	);
}

function MobileRailLink({
	item,
	active,
	onNavigate,
	onPrefetch,
}: {
	item: RailItem;
	active: boolean;
	onNavigate: () => void;
	onPrefetch: () => void;
}) {
	const t = useT();
	return (
		<Button
			asChild
			variant="ghost"
			className={cn(
				"justify-start gap-3 text-muted-foreground",
				active &&
					"bg-muted text-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<Link
				href={item.href}
				prefetch
				onMouseEnter={onPrefetch}
				onFocus={onPrefetch}
				aria-current={active ? "page" : undefined}
				onClick={onNavigate}
				transitionTypes={[
					item.title === "Chat" ? "nav-forward" : "nav-lateral",
				]}
			>
				<Icon icon={item.icon} />
				<span>{t(item.title)}</span>
			</Link>
		</Button>
	);
}

function MobileRailIconLink({
	item,
	active,
	onNavigate,
	onPrefetch,
}: {
	item: RailItem;
	active: boolean;
	onNavigate: () => void;
	onPrefetch: () => void;
}) {
	const t = useT();
	return (
		<Button
			asChild
			variant="ghost"
			size="icon"
			className={cn(
				"text-muted-foreground",
				active &&
					"bg-muted text-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<Link
				href={item.href}
				prefetch
				onMouseEnter={onPrefetch}
				onFocus={onPrefetch}
				aria-current={active ? "page" : undefined}
				onClick={onNavigate}
			>
				<Icon icon={item.icon} />
				<span className="sr-only">{t(item.title)}</span>
			</Link>
		</Button>
	);
}

export function AppIconRailFallback() {
	const t = useT();
	return (
		<nav
			aria-label={t("Primary")}
			aria-busy="true"
			className="hidden w-14 shrink-0 flex-col items-center gap-0.5 border-r bg-background py-3 md:flex [view-transition-name:app-rail]"
		>
			{ITEMS.map((item) => (
				<Button
					key={item.href}
					variant="ghost"
					size="icon"
					disabled
					className="shrink-0 text-muted-foreground"
				>
					<Icon icon={item.icon} />
					<span className="sr-only">{t(item.title)}</span>
				</Button>
			))}
		</nav>
	);
}

export function AppIconRail() {
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();
	const { open, setOpen } = useMobileNav();
	const prefetchSection = usePrefetchSection();
	const t = useT();

	const groups = useMemo(
		() =>
			GROUPS.map((group) =>
				group.map((item) => ({
					...item,
					section: item.href,
					href: workspaceUrl(item.href),
					related: item.related?.map((path) => workspaceUrl(path)),
				})),
			),
		[workspaceUrl],
	);
	const items = useMemo(() => groups.flat(), [groups]);
	const inChat = items.some(
		(item) => item.title === "Chat" && isActive(item, pathname),
	);

	return (
		<>
			<nav
				aria-label={t("Primary")}
				className="hidden w-14 shrink-0 flex-col items-center gap-0.5 border-r bg-background py-3 md:flex [view-transition-name:app-rail]"
			>
				{groups.map((group, index) => (
					<Fragment key={group.map((item) => item.href).join()}>
						{index === groups.length - 1 ? (
							<div className="flex-1" />
						) : index > 0 ? (
							<div className="my-2 h-px w-5 shrink-0 bg-border" />
						) : null}
						{group.map((item) => (
							<RailLink
								key={item.href}
								item={item}
								active={isActive(item, pathname)}
								onPrefetch={() => prefetchSection(item.section)}
							/>
						))}
					</Fragment>
				))}
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
							className="flex w-14 shrink-0 flex-col items-center gap-1 border-r py-3"
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
								<MobileRailIconLink
									key={item.href}
									item={item}
									active={isActive(item, pathname)}
									onNavigate={() => setOpen(false)}
									onPrefetch={() => prefetchSection(item.section)}
								/>
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
							className="flex flex-1 flex-col gap-1 p-2"
						>
							{items.map((item) => (
								<MobileRailLink
									key={item.href}
									item={item}
									active={isActive(item, pathname)}
									onNavigate={() => setOpen(false)}
									onPrefetch={() => prefetchSection(item.section)}
								/>
							))}
						</nav>
					</SheetContent>
				)}
			</Sheet>
		</>
	);
}
