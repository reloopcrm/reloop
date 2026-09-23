"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldDescription, FieldError } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

export function WaitlistForm() {
	const t = useT();
	const trpc = useTRPC();
	const id = useId();
	const [email, setEmail] = useState("");
	const join = useMutation(trpc.waitlist.join.mutationOptions());

	if (join.isSuccess) {
		return (
			<p role="status" className="text-body-foreground text-sm/6">
				{t("Thanks. We will email you when Cloud opens.")}
			</p>
		);
	}

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				join.mutate({ email });
			}}
		>
			<Field data-invalid={join.isError || undefined}>
				<Input
					id={id}
					type="email"
					required
					autoComplete="email"
					placeholder={t("you@company.com")}
					aria-label={t("Email")}
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					aria-invalid={join.isError || undefined}
				/>
				<Button type="submit" disabled={join.isPending}>
					{join.isPending ? <Spinner data-icon="inline-start" /> : null}
					{t("Notify me")}
				</Button>
				{join.isError ? (
					<FieldError>
						{t(
							join.error.data?.code === "TOO_MANY_REQUESTS"
								? "Too many sign-ups from here. Wait a minute and try again."
								: "That did not work. Check the address and try again.",
						)}
					</FieldError>
				) : (
					<FieldDescription>
						{t("We send one email when Cloud opens.")}
					</FieldDescription>
				)}
			</Field>
		</form>
	);
}
