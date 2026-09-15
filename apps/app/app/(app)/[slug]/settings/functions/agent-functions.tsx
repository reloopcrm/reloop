"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Label } from "@crm/ui/components/label";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const GROUPS = [
	{
		id: "reading",
		title: "Reading your email",
		description: "What the agent reads by itself, every minute.",
	},
	{
		id: "research",
		title: "Research",
		description:
			"What the agent looks up about the people and companies you work with.",
	},
	{
		id: "pictures",
		title: "Logos and photos",
		description: "The pictures on a record.",
	},
	{
		id: "writing",
		title: "Writing",
		description: "What the agent writes for you.",
	},
	{
		id: "rules",
		title: "Rules and setup",
		description: "What the agent learns about your own business.",
	},
] as const;

export function AgentFunctions() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const functions = useQuery(trpc.settings.agentFunctions.queryOptions());

	const setFunction = useMutation(
		trpc.settings.setAgentFunction.mutationOptions({
			onSuccess: () => cache.settings({ settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!functions.data) return null;

	const { canManage, functions: rows } = functions.data;
	const busy = !canManage || setFunction.isPending;

	return (
		<>
			{GROUPS.map((group) => {
				const members = rows.filter((row) => row.group === group.id);
				if (members.length === 0) return null;

				return (
					<Card key={group.id}>
						<CardHeader>
							<CardTitle>{t(group.title)}</CardTitle>
							<CardDescription>{t(group.description)}</CardDescription>
						</CardHeader>

						<CardContent>
							{members.map((row) => (
								<div
									key={row.id}
									className="flex items-center justify-between gap-6"
								>
									<Label
										htmlFor={`function-${row.id}`}
										className="flex flex-col items-start gap-1"
									>
										<span className="text-sm">{t(row.title)}</span>
										<span className="font-normal text-muted-foreground text-xs">
											{t(row.note)}
										</span>
									</Label>

									<Switch
										id={`function-${row.id}`}
										checked={row.enabled}
										disabled={busy}
										onCheckedChange={(enabled) =>
											setFunction.mutate({ id: row.id, enabled })
										}
									/>
								</div>
							))}
						</CardContent>
					</Card>
				);
			})}

			{canManage ? null : (
				<p className="text-muted-foreground text-sm">
					{t("Only an owner or an admin can change this.")}
				</p>
			)}
		</>
	);
}
