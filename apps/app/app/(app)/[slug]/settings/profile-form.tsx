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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ProfileForm() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const nameId = useId();

	const me = useQuery(trpc.users.me.queryOptions());
	const [draft, setDraft] = useState<string | null>(null);

	const save = useMutation(
		trpc.users.rename.mutationOptions({
			onSuccess: async () => {
				await cache.profile();
				setDraft(null);
				toast.success(t("Your name is saved."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!me.data) return null;

	const name = me.data.name;
	const value = draft ?? name;
	const dirty = value.trim() !== name && value.trim().length > 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Your name")}</CardTitle>
				<CardDescription>
					{t("Your team sees this name on every record.")}
				</CardDescription>

				<CardAction>
					<Button
						type="submit"
						variant="outline"
						form="profile"
						disabled={save.isPending || !dirty}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t("Save")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="profile"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate({ name: value.trim() });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={nameId}>{t("Name")}</FieldLabel>
							<Input
								id={nameId}
								value={value}
								maxLength={80}
								onChange={(event) => setDraft(event.target.value)}
							/>
							<FieldDescription>
								{t("Your email address stays {email}.", {
									email: me.data.email,
								})}
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
