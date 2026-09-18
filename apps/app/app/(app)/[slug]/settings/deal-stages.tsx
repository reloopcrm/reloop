"use client";

import { DEAL_STAGE_LABEL } from "@crm/db/deal-stage";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function DealStages() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [edits, setEdits] = useState<Record<string, string>>({});

	const stages = useQuery(trpc.settings.dealStages.queryOptions());

	const save = useMutation(
		trpc.settings.setDealStageName.mutationOptions({
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!stages.data) return null;

	const rows = stages.data.stages;
	const typed = (row: (typeof rows)[number]) =>
		edits[row.stage] ?? row.name ?? "";
	const changed = rows.filter((row) => typed(row).trim() !== (row.name ?? ""));

	const submit = async () => {
		try {
			for (const row of changed) {
				const name = typed(row).trim();
				await save.mutateAsync({ stage: row.stage, name: name || null });
			}
		} catch {
			return;
		}

		await cache.settings();
		toast.success(t("Stage names saved."));
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Pipeline stages")}</CardTitle>
				<CardDescription>
					{t(
						"What your team calls each stage of a deal. Renaming a stage moves no deal.",
					)}
				</CardDescription>

				<CardAction>
					<Button
						type="submit"
						variant="outline"
						form="deal-stages"
						disabled={
							save.isPending || changed.length === 0 || !stages.data.canRename
						}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t("Save")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="deal-stages"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<FieldGroup>
						{rows.map((row) => {
							const built = t(DEAL_STAGE_LABEL[row.stage]);
							return (
								<Field key={row.stage}>
									<FieldLabel htmlFor={`deal-stage-${row.stage}`}>
										{built}
									</FieldLabel>
									<Input
										id={`deal-stage-${row.stage}`}
										value={typed(row)}
										placeholder={built}
										disabled={save.isPending || !stages.data.canRename}
										onChange={(event) =>
											setEdits((current) => ({
												...current,
												[row.stage]: event.target.value,
											}))
										}
									/>
								</Field>
							);
						})}

						<FieldDescription>
							{t(
								"An empty field keeps the built-in name. Your own wording is shown exactly as you type it, in every language.",
							)}
						</FieldDescription>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
