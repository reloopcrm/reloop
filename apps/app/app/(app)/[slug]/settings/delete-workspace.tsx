"use client";

import {
	AlertDialog,
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
	CardAction,
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
import { Separator } from "@crm/ui/components/separator";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n/client";
import { translateError } from "@/lib/i18n/errors";
import { useTRPC } from "@/lib/trpc/client";

export type DeletionReauth = "password" | "code";

export function DeleteWorkspace({
	reauth,
	backupDays,
}: {
	reauth: DeletionReauth;
	backupDays: number;
}) {
	const t = useT();

	return (
		<>
			<Separator />
			<Card id="danger-zone">
				<CardHeader>
					<CardTitle>{t("Danger zone")}</CardTitle>
					<CardDescription>
						{t("Delete this workspace and everything in it.")}
					</CardDescription>
					<CardAction>
						<DeleteDialog reauth={reauth} backupDays={backupDays} />
					</CardAction>
				</CardHeader>
			</Card>
		</>
	);
}

function DeleteDialog({
	reauth,
	backupDays,
}: {
	reauth: DeletionReauth;
	backupDays: number;
}) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const nameId = useId();
	const secretId = useId();

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [secret, setSecret] = useState("");

	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const workspaceName = workspace.data?.name.trim() ?? "";

	const sendCode = useMutation(
		trpc.workspace.deletionCode.mutationOptions({
			onSuccess: () => toast.success(t("We sent a code to your email.")),
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const remove = useMutation(
		trpc.workspace.delete.mutationOptions({
			onSuccess: () => window.location.assign("/sign-in"),
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const ready =
		workspaceName.length > 0 &&
		name.trim() === workspaceName &&
		secret.trim().length > 0 &&
		!remove.isPending;

	const changeOpen = (next: boolean) => {
		if (remove.isPending) return;
		setOpen(next);
		if (next) return;
		setName("");
		setSecret("");
	};

	return (
		<AlertDialog open={open} onOpenChange={changeOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">
					{t("Delete workspace permanently")}
				</Button>
			</AlertDialogTrigger>

			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("Delete this workspace permanently?")}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<ul className="flex list-disc flex-col gap-1 pl-4">
							<li>
								{t(
									"All contacts, companies, mails, deals, notes and agents are deleted.",
								)}
							</li>
							<li>{t("Every connected mailbox is disconnected.")}</li>
							<li>
								{t(
									"The subscription ends today. Nothing is refunded for the time left.",
								)}
							</li>
							<li>
								{t(
									"The backups on our servers are removed after {days} days.",
									{ days: backupDays },
								)}
							</li>
							<li>{t("This cannot be undone.")}</li>
						</ul>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<form
					id="delete-workspace"
					onSubmit={(event) => {
						event.preventDefault();
						if (!ready) return;
						remove.mutate({
							name: name.trim(),
							reauth:
								reauth === "password"
									? { method: "password", password: secret }
									: { method: "code", code: secret.trim() },
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={nameId}>
								{t("Type {name} to confirm", { name: workspaceName })}
							</FieldLabel>
							<Input
								id={nameId}
								autoComplete="off"
								value={name}
								disabled={remove.isPending}
								onChange={(event) => setName(event.target.value)}
							/>
						</Field>

						{reauth === "password" ? (
							<Field>
								<FieldLabel htmlFor={secretId}>{t("Your password")}</FieldLabel>
								<Input
									id={secretId}
									type="password"
									autoComplete="current-password"
									value={secret}
									disabled={remove.isPending}
									onChange={(event) => setSecret(event.target.value)}
								/>
							</Field>
						) : (
							<Field>
								<FieldLabel htmlFor={secretId}>
									{t("Code from the email")}
								</FieldLabel>
								<div className="flex gap-2">
									<Input
										id={secretId}
										inputMode="numeric"
										autoComplete="one-time-code"
										value={secret}
										disabled={remove.isPending}
										onChange={(event) => setSecret(event.target.value)}
									/>
									<Button
										type="button"
										variant="outline"
										disabled={sendCode.isPending || remove.isPending}
										onClick={() => sendCode.mutate({ locale })}
									>
										{sendCode.isPending ? (
											<Spinner data-icon="inline-start" />
										) : null}
										{sendCode.isSuccess ? t("Send again") : t("Send code")}
									</Button>
								</div>
								<FieldDescription>
									{t(
										"You signed in without a password, so we confirm it by email.",
									)}
								</FieldDescription>
							</Field>
						)}
					</FieldGroup>
				</form>

				<AlertDialogFooter>
					<AlertDialogCancel disabled={remove.isPending}>
						{t("Cancel")}
					</AlertDialogCancel>
					<Button
						type="submit"
						form="delete-workspace"
						variant="destructive"
						disabled={!ready}
					>
						{remove.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t("Delete workspace permanently")}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
