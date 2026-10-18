"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Bot from "@carbon/icons-react/es/Bot";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Agents = RouterOutputs["agents"]["list"];

export function TeamAgentsIndex({ initialAgents }: { initialAgents: Agents }) {
	const t = useT();
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const agents = useQuery({
		...trpc.agents.list.queryOptions(),
		initialData: initialAgents,
	});
	const rows = agents.data ?? initialAgents;

	return (
		<>
			{rows.length ? (
				<div className="overflow-hidden rounded-lg border bg-card">
					{rows.map((agent) => (
						<Link
							key={agent.id}
							href={workspaceUrl(`/agents/${agent.id}`)}
							transitionTypes={["nav-forward"]}
							className="flex min-h-16 min-w-0 items-start gap-3 border-t px-4 py-4 outline-none first:border-t-0 hover:bg-muted/50 focus-visible:bg-muted/50 sm:items-center sm:gap-4 sm:px-5 sm:py-3"
						>
							<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<Icon icon={Bot} />
							</span>
							<span className="min-w-0 flex-1">
								<span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
									<span className="min-w-0 wrap-break-word font-medium text-sm sm:truncate">
										{agent.name}
									</span>
									<span className="shrink-0 text-muted-foreground text-xs">
										{t(agent.status.toLowerCase())}
									</span>
								</span>
								<span className="mt-1 block wrap-break-word text-muted-foreground text-xs sm:mt-0 sm:truncate">
									{agent.description ?? t("No description")}
								</span>
								<span className="mt-2 block font-mono text-muted-foreground text-xs sm:hidden">
									{runLabel(agent.runCount, t)}
								</span>
							</span>
							<span className="hidden shrink-0 font-mono text-muted-foreground text-xs sm:inline">
								{runLabel(agent.runCount, t)}
							</span>
							<Icon
								icon={ArrowRight}
								className="size-4 text-muted-foreground"
							/>
						</Link>
					))}
				</div>
			) : (
				<Empty className="flex-1">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Icon icon={Bot} />
						</EmptyMedia>
						<EmptyTitle>{t("No team agents yet")}</EmptyTitle>
						<EmptyDescription>
							{t(
								"Create one from a private chat, then review its access before deploying it.",
							)}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild variant="link">
							<Link href={workspaceUrl("/chat")}>{t("Open chat")}</Link>
						</Button>
					</EmptyContent>
				</Empty>
			)}
		</>
	);
}

function runLabel(count: number, t: Translate): string {
	return count === 1
		? t("{count} run", { count })
		: t("{count} runs", { count });
}
