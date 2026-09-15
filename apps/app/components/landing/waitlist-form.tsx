"use client";

import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

export function WaitlistForm() {
	const trpc = useTRPC();
	const id = useId();
	const [email, setEmail] = useState("");
	const join = useMutation(trpc.waitlist.join.mutationOptions());

	if (join.isSuccess) {
		return (
			<p role="status" className="text-body-foreground text-sm/6">
				Check your inbox and click the link to confirm.
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
				<FieldLabel htmlFor={id}>Email</FieldLabel>
				<div className="flex gap-2">
					<Input
						id={id}
						type="email"
						required
						autoComplete="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						aria-invalid={join.isError || undefined}
					/>
					<Button type="submit" variant="outline" disabled={join.isPending}>
						{join.isPending ? <Spinner data-icon="inline-start" /> : null}
						Notify me
					</Button>
				</div>
				{join.isError ? (
					<FieldError>
						That did not work. Check the address and try again.
					</FieldError>
				) : (
					<FieldDescription>
						We send one email to confirm, and one when Cloud opens.
					</FieldDescription>
				)}
			</Field>
		</form>
	);
}
