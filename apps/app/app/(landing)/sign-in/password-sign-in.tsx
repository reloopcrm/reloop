"use client";

import { signIn } from "@crm/auth/client";
import { PASSWORD_RULES } from "@crm/auth/password-rules";
import { Button } from "@crm/ui/components/button";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import { signInFailureText } from "@/lib/sign-in-errors";

export function PasswordSignIn({ email: known }: { email?: string }) {
	const t = useT();
	const [pending, setPending] = useState(false);
	const [email, setEmail] = useState(known ?? "");
	const [password, setPassword] = useState("");

	function fail(failure?: { code?: string; status?: number }) {
		setPending(false);

		const { label, vars } = signInFailureText(failure);
		toast.error(t(label, vars));
	}

	async function handleSubmit() {
		setPending(true);

		const { error } = await signIn.email({
			email: email.trim(),
			password,
			callbackURL: `${window.location.origin}/`,
		});

		if (error) fail(error);
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				handleSubmit().catch(() => fail());
			}}
		>
			{known === undefined ? (
				<Field>
					<FieldLabel htmlFor="sign-in-email">{t("Email address")}</FieldLabel>
					<Input
						id="sign-in-email"
						name="email"
						type="email"
						autoComplete="username"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
					/>
				</Field>
			) : null}

			<Field>
				<FieldLabel htmlFor="sign-in-password">{t("Password")}</FieldLabel>
				<Input
					id="sign-in-password"
					name="password"
					type="password"
					autoComplete="current-password"
					required
					minLength={PASSWORD_RULES.minLength}
					maxLength={PASSWORD_RULES.maxLength}
					autoFocus={known !== undefined}
					value={password}
					onChange={(event) => setPassword(event.target.value)}
				/>
			</Field>

			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				{t("Sign in")}
			</Button>
		</form>
	);
}
