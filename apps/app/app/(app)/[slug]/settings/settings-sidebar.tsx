"use client";

import { Button } from "@crm/ui/components/button";
import { Separator } from "@crm/ui/components/separator";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useMemo } from "react";
import { useT } from "@/lib/i18n/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type SettingsNavItem = {
	title: string;
	href: string;
	cloudOwner?: boolean;
	hosted?: boolean;
	selfHosted?: boolean;
	admin?: boolean;
	group?: "plan";
};

export type SettingsNavAudience = {
	cloudOwner: boolean;
	hosted?: boolean;
	admin?: boolean;
};

const ROOT = "/settings";

const ITEMS: SettingsNavItem[] = [
	{ title: "General", href: ROOT },
	{ title: "Tracking & Analytics", href: `${ROOT}/tracking` },
	{ title: "Connections", href: `${ROOT}/connections` },
	{ title: "AI", href: `${ROOT}/ai`, selfHosted: true },
	{ title: "Functions", href: `${ROOT}/functions` },
	{ title: "Currencies", href: `${ROOT}/currencies` },
	{ title: "Members", href: `${ROOT}/members` },
	{ title: "API Keys", href: `${ROOT}/api-keys` },
	{ title: "SSO", href: `${ROOT}/sso` },
	{ title: "Waitlist", href: `${ROOT}/waitlist`, cloudOwner: true },
	{ title: "Usage", href: `${ROOT}/ai`, hosted: true, group: "plan" },
	{
		title: "Plan & billing",
		href: `${ROOT}/billing`,
		hosted: true,
		admin: true,
		group: "plan",
	},
];

export function settingsNavItems(who: SettingsNavAudience): SettingsNavItem[] {
	const hosted = who.hosted ?? false;
	const admin = who.admin ?? false;
	return ITEMS.filter(
		(item) =>
			(who.cloudOwner || !item.cloudOwner) &&
			(hosted || !item.hosted) &&
			(!hosted || !item.selfHosted) &&
			(admin || !item.admin),
	);
}

function startsGroup(items: SettingsNavItem[], index: number): boolean {
	const item = items[index];
	return item?.group !== undefined && items[index - 1]?.group !== item.group;
}

function isActive(href: string, root: string, pathname: string): boolean {
	return href === root ? pathname === href : pathname.startsWith(href);
}

function NavLink({
	item,
	active,
	className,
}: {
	item: SettingsNavItem;
	active: boolean;
	className: string;
}) {
	const t = useT();
	return (
		<Button asChild variant="nav" className={className}>
			<Link
				href={item.href}
				prefetch
				aria-current={active ? "page" : undefined}
				transitionTypes={["nav-lateral"]}
			>
				{t(item.title)}
			</Link>
		</Button>
	);
}

export function SettingsSidebarFallback() {
	const t = useT();
	return (
		<>
			<aside className="hidden w-(--container-sidebar) shrink-0 border-r md:block [view-transition-name:settings-sidebar]">
				<nav
					aria-label={t("Workspace settings")}
					aria-busy="true"
					className="flex flex-col gap-0.5 px-4 pt-(--spacing-page-top) pb-4"
				>
					<span className="px-3 pb-3 font-medium text-muted-foreground text-xs">
						{t("Settings")}
					</span>
					{settingsNavItems({ cloudOwner: false }).map((item) => (
						<Button
							key={item.href}
							variant="nav"
							disabled
							className="w-full px-3"
						>
							{t(item.title)}
						</Button>
					))}
				</nav>
			</aside>

			<nav
				aria-label={t("Workspace settings")}
				aria-busy="true"
				className="flex gap-1 overflow-x-auto border-b p-2 md:hidden [view-transition-name:settings-sidebar]"
			>
				{settingsNavItems({ cloudOwner: false }).map((item) => (
					<Button
						key={item.href}
						variant="nav"
						disabled
						className="shrink-0 px-3"
					>
						{t(item.title)}
					</Button>
				))}
			</nav>
		</>
	);
}

export function SettingsSidebar({
	cloudOwner,
	hosted,
	admin,
}: SettingsNavAudience) {
	const t = useT();
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();

	const root = workspaceUrl(ROOT);
	const items = useMemo(
		() =>
			settingsNavItems({ cloudOwner, hosted, admin }).map((item) => ({
				...item,
				href: workspaceUrl(item.href),
			})),
		[workspaceUrl, cloudOwner, hosted, admin],
	);

	return (
		<>
			<aside className="hidden w-(--container-sidebar) shrink-0 border-r md:block [view-transition-name:settings-sidebar]">
				<nav
					aria-label={t("Workspace settings")}
					className="flex flex-col gap-0.5 px-4 pt-(--spacing-page-top) pb-4"
				>
					<span className="px-3 pb-3 font-medium text-muted-foreground text-xs">
						{t("Settings")}
					</span>
					{items.map((item, index) => (
						<Fragment key={item.href}>
							{startsGroup(items, index) ? (
								<div className="px-3 py-2">
									<Separator />
								</div>
							) : null}
							<NavLink
								item={item}
								active={isActive(item.href, root, pathname)}
								className="w-full px-3"
							/>
						</Fragment>
					))}
				</nav>
			</aside>

			<nav
				aria-label={t("Workspace settings")}
				className="flex gap-1 overflow-x-auto border-b p-2 md:hidden [view-transition-name:settings-sidebar]"
			>
				{items.map((item, index) => (
					<Fragment key={item.href}>
						{startsGroup(items, index) ? (
							<div className="flex items-stretch px-1 py-2">
								<Separator orientation="vertical" />
							</div>
						) : null}
						<NavLink
							item={item}
							active={isActive(item.href, root, pathname)}
							className="shrink-0 px-3"
						/>
					</Fragment>
				))}
			</nav>
		</>
	);
}
