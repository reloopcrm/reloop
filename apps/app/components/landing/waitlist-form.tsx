"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldDescription, FieldError } from "@crm/ui/components/field";
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
				Thanks. We will email you when Cloud opens.
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
					size="lg"
					required
					autoComplete="email"
					placeholder="you@company.com"
					aria-label="Email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					aria-invalid={join.isError || undefined}
				/>
				<div className="flex flex-wrap items-center gap-3">
					<Button type="submit" variant="outline" disabled={join.isPending}>
						{join.isPending ? <Spinner data-icon="inline-start" /> : null}
						Notify me
					</Button>
				</div>
				{join.isError ? (
					<FieldError>
						{join.error.data?.code === "TOO_MANY_REQUESTS"
							? "Too many sign-ups from here. Wait a minute and try again."
							: "That did not work. Check the address and try again."}
					</FieldError>
				) : (
					<FieldDescription>
						We send one email when Cloud opens.
					</FieldDescription>
				)}
			</Field>
		</form>
	);
}
