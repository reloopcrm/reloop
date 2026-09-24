"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { isLocale, LOCALE, LOCALES } from "@/lib/i18n/locale";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function AgentLanguage() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const fieldId = useId();

	const current = useQuery(trpc.settings.agentLanguage.queryOptions());

	const save = useMutation(
		trpc.settings.setAgentLanguage.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				toast.success(t("Agent language saved."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!current.data) return null;

	const { language, fallback, hosted } = current.data;
	const unset = hosted
		? t("{language} (not chosen yet)", { language: LOCALE.names[fallback] })
		: t("Install default");

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Agent language")}</CardTitle>
				<CardDescription>
					{t(
						"The agent writes in this language for everyone in this workspace.",
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Field>
					<FieldLabel htmlFor={fieldId}>{t("Language")}</FieldLabel>
					<Select
						value={language ?? ""}
						disabled={save.isPending}
						onValueChange={(value) => {
							if (!isLocale(value) || value === language) return;
							save.mutate({ language: value });
						}}
					>
						<SelectTrigger id={fieldId} className="w-60">
							<SelectValue placeholder={unset}>
								{language ? LOCALE.names[language] : unset}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{LOCALES.map((value) => (
								<SelectItem key={value} value={value}>
									{LOCALE.names[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FieldDescription>
						{t(
							"Summaries, notes and business rules follow it. A reply draft keeps the language of its conversation.",
						)}
					</FieldDescription>
				</Field>
			</CardContent>
		</Card>
	);
}
