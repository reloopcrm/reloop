"use client";

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
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n/client";
import { translateError } from "@/lib/i18n/errors";
import { useTRPC } from "@/lib/trpc/client";

export function PasswordSignIn() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const firstId = useId();
	const againId = useId();

	const [first, setFirst] = useState("");
	const [again, setAgain] = useState("");

	const password = useQuery(trpc.settings.passwordSignIn.queryOptions());

	const save = useMutation(
		trpc.settings.setPassword.mutationOptions({
			onSuccess: async () => {
				setFirst("");
				setAgain("");
				await password.refetch();
				toast.success(t("Password saved."));
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	if (!password.data?.enabled) return null;

	const { set, minLength, maxLength } = password.data;
	const tooShort = first.length > 0 && first.length < minLength;
	const mismatch = again.length > 0 && first !== again;
	const ready =
		first.length >= minLength && first.length <= maxLength && first === again;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						{t("Password")}
						<StatusIndicator
							size="sm"
							tone={set ? "success" : "warning"}
							label={set ? t("Set") : t("Not set yet")}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{set
						? t(
								"You sign in with your email address and this password. Enter a new one to replace it.",
							)
						: t(
								"Set a password so you can sign in with your email address. Without one, only the sign-in methods above get you in.",
							)}
				</CardDescription>

				<CardAction>
					<Button
						type="submit"
						form="password"
						disabled={save.isPending || !ready}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t("Save")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="password"
					onSubmit={(event) => {
						event.preventDefault();
						if (!ready) return;
						save.mutate({ newPassword: first });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={firstId}>{t("New password")}</FieldLabel>
							<Input
								id={firstId}
								type="password"
								autoComplete="new-password"
								value={first}
								disabled={save.isPending}
								onChange={(event) => setFirst(event.target.value)}
							/>
							<FieldDescription>
								{tooShort
									? t("At least {count} characters.", { count: minLength })
									: t(
											"At least {count} characters. The page is open on the internet, so pick a long one.",
											{ count: minLength },
										)}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={againId}>{t("Repeat it")}</FieldLabel>
							<Input
								id={againId}
								type="password"
								autoComplete="new-password"
								value={again}
								disabled={save.isPending}
								onChange={(event) => setAgain(event.target.value)}
							/>
							{mismatch ? (
								<FieldDescription>
									{t("The two entries are not the same.")}
								</FieldDescription>
							) : null}
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
