"use client";

import Filter from "@carbon/icons-react/es/Filter";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n/client";
import { translateError } from "@/lib/i18n/errors";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function TypesafeConnection() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const keyId = useId();

	const [apiKey, setApiKey] = useState("");

	const status = useQuery(trpc.typesafe.status.queryOptions());

	const save = useMutation(
		trpc.typesafe.save.mutationOptions({
			onSuccess: async () => {
				await cache.typesafe();
				setApiKey("");
				toast.success(
					t("The key is saved. The next mail conversation is read cheaply."),
				);
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const disconnect = useMutation(
		trpc.typesafe.disconnect.mutationOptions({
			onSuccess: async () => {
				await cache.typesafe();
				toast.success(t("The key is deleted. Nothing goes to TypeSafe again."));
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	if (!status.data) return null;

	const { connected, keyHint, canManage } = status.data;

	return (
		<>
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<h1 className="flex items-center gap-2 font-medium text-2xl tracking-tight">
					<Icon icon={Filter} />
					TypeSafe
				</h1>
				<p className="max-w-2xl text-muted-foreground text-sm">
					{t(
						"Reads every mail conversation once with a cheap model first, and pays for the expensive read only when the conversation looks like business.",
					)}
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>
						<div className="flex items-center gap-2">
							{connected ? t("Connected") : t("Off")}
							<StatusIndicator
								size="sm"
								tone={connected ? "success" : "neutral"}
								label={connected ? t("Connected") : t("Not connected")}
							/>
						</div>
					</CardTitle>
					<CardDescription>
						{t(
							"Brings in nothing. Sends the business description from Settings and one mail conversation per read, so turn it on only if that is acceptable to you.",
						)}
					</CardDescription>
				</CardHeader>

				<CardContent className="flex flex-col gap-4">
					<p className="text-muted-foreground text-sm">
						{t(
							"It is off by default. Nothing goes to TypeSafe until you save a key. A conversation the cheap model calls business still gets the full read, so nothing is lost there.",
						)}
					</p>

					<form
						onSubmit={(event) => {
							event.preventDefault();
							save.mutate({ apiKey: apiKey.trim() });
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={keyId}>{t("API key")}</FieldLabel>
								<Input
									id={keyId}
									type="password"
									value={apiKey}
									onChange={(event) => setApiKey(event.target.value)}
									autoComplete="new-password"
									disabled={!canManage}
									placeholder={
										keyHint ?? t("The key from your TypeSafe account")
									}
								/>
								<FieldDescription>
									{connected
										? t(
												"A key is saved. Stored encrypted and never shown again. Paste a new one to replace it.",
											)
										: t(
												"Stored encrypted and never shown again. You can also set TYPESAFE_API_KEY in the environment, and a key saved here wins over it.",
											)}
								</FieldDescription>
							</Field>

							<Button
								type="submit"
								size="sm"
								className="self-start"
								disabled={!canManage || apiKey.trim().length === 0}
							>
								{connected ? t("Replace key") : t("Save key")}
							</Button>
						</FieldGroup>
					</form>
				</CardContent>

				{connected ? (
					<CardFooter>
						<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="ghost"
										size="xs"
										disabled={!canManage || disconnect.isPending}
									>
										{t("Delete the key")}
									</Button>
								</AlertDialogTrigger>

								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>{t("Delete the key?")}</AlertDialogTitle>
										<AlertDialogDescription>
											{t(
												"Nothing goes to TypeSafe again, and every mail conversation gets the expensive read. Everything in the CRM stays as it is.",
											)}
										</AlertDialogDescription>
									</AlertDialogHeader>

									<AlertDialogFooter>
										<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={() => disconnect.mutate()}
										>
											{t("Delete")}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</CardFooter>
				) : null}
			</Card>
		</>
	);
}
