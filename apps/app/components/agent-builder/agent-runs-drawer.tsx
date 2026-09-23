"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { AgentActivity, AgentRuns } from "./agent-history";

type Runs = RouterOutputs["agents"]["history"];
type Activity = RouterOutputs["agents"]["activity"];

const VIEWS = [
	{ id: "runs", label: "Runs" },
	{ id: "activity", label: "Activity" },
] as const;

type View = (typeof VIEWS)[number]["id"];

export function AgentRunsDrawer({
	activity,
	cancelling,
	onCancel,
	onOpenChange,
	onRetry,
	open,
	retryingRunId,
	runs,
}: {
	activity: Activity;
	agentId: string;
	cancelling: boolean;
	onCancel: (runId: string) => void;
	onOpenChange: (open: boolean) => void;
	onRetry: (runId: string) => void;
	open: boolean;
	retryingRunId?: string;
	runs: Runs;
}) {
	const t = useT();
	const [view, setView] = useState<View>("runs");
	const [wasOpen, setWasOpen] = useState(open);

	if (wasOpen !== open) {
		setWasOpen(open);
		if (open) setView("runs");
	}

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="flex flex-col gap-0 p-0" side="right" size="xl">
				<SheetHeader className="gap-1 border-b px-5 py-4">
					<SheetTitle>{t("History")}</SheetTitle>
					<SheetDescription>
						{t("Every run and every change, newest first.")}
					</SheetDescription>
				</SheetHeader>

				<Tabs
					value={view}
					onValueChange={(value) => setView(value as View)}
					className="shrink-0 border-b px-5"
				>
					<TabsList variant="line">
						{VIEWS.map((entry) => (
							<TabsTrigger key={entry.id} value={entry.id}>
								{t(entry.label)}{" "}
								<span className="font-mono text-muted-foreground">
									{entry.id === "runs" ? runs.length : activity.length}
								</span>
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					{view === "runs" ? (
						<AgentRuns
							cancelling={cancelling}
							onCancel={onCancel}
							onRetry={onRetry}
							retryingRunId={retryingRunId}
							runs={runs}
						/>
					) : (
						<AgentActivity activity={activity} />
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
