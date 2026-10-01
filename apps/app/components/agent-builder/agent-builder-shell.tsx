"use client";

import { MonoLabel } from "@crm/ui/components/mark";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useT } from "@/lib/i18n/client";

export function AgentBuilderShell({
	children,
	sidebar,
}: {
	children: React.ReactNode;
	sidebar: React.ReactNode;
}) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1">
			{sidebar}
			<div className="flex min-w-0 flex-1 flex-col">{children}</div>
		</div>
	);
}

export function AgentBuilderSidebarFallback() {
	const t = useT();
	return (
		<aside
			className="hidden w-(--container-sidebar) flex-none flex-col border-r px-4 py-6 md:flex"
			aria-busy="true"
		>
			<div className="flex h-7 items-center">
				<MonoLabel>{t("Chats")}</MonoLabel>
			</div>
			<div className="mt-3 flex flex-col gap-2" aria-hidden="true">
				<Skeleton className="h-2.5 w-16" />
				<Skeleton className="h-7 w-full" />
				<Skeleton className="h-7 w-full" />
			</div>
			<span role="status" className="sr-only">
				{t("Loading agent navigation…")}
			</span>
		</aside>
	);
}
