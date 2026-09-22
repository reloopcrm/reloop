"use client";

import { signIn } from "@crm/auth/client";
import { PASSWORD_RULES } from "@crm/auth/password-rules";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n/client";
import { signInFailureText } from "@/lib/sign-in-errors";
import {
	confirmPasswordReset,
	requestPasswordReset,
	type TenantRefusal,
} from "@/lib/tenant-api";

export function PasswordReset({
	email,
	refusals,
}: {
	email: string;
	refusals: Record<TenantRefusal, string>;
}) {
	const t = useT();
	const locale = useLocale();
	const [sent, setSent] = useState(false);
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);
	const [refusal, setRefusal] = useState<TenantRefusal | null>(null);

	function fail(code: TenantRefusal) {
		setPending(false);
		setRefusal(code);
	}

	async function handleRequest() {
		setPending(true);
		setRefusal(null);

		const outcome = await requestPasswordReset({ email, locale });
		setPending(false);

		if (outcome.ok) setSent(true);
		else setRefusal(outcome.code);
	}

	async function handleConfirm() {
		setPending(true);
		setRefusal(null);

		const outcome = await confirmPasswordReset({ email, code, password });
		if (!outcome.ok) {
			fail(outcome.code);
			return;
		}

		const { error } = await signIn.email({
			email,
			password,
			callbackURL: `${window.location.origin}/`,
		});
		if (error) {
			setPending(false);
			const { label, vars } = signInFailureText(error);
			toast.error(t(label, vars));
		}
	}

	if (!sent) {
		return (
			<div className="flex flex-col gap-4">
				<p className="text-body-foreground text-sm/6">
					{t("We mail a code to {email}. With it you set a new password.", {
						email,
					})}
				</p>
				{refusal ? <FieldError>{t(refusals[refusal])}</FieldError> : null}
				<Button
					className="w-full"
					type="button"
					disabled={pending}
					onClick={() => {
						handleRequest().catch(() => fail("FAILED"));
					}}
				>
					{pending ? <Spinner data-icon="inline-start" /> : null}
					{t("Send me a code")}
				</Button>
			</div>
		);
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				handleConfirm().catch(() => fail("FAILED"));
			}}
		>
			<p role="status" className="text-body-foreground text-sm/6">
				{t("If {email} has a password, a code is on its way. Enter it here.", {
					email,
				})}
			</p>

			<Field data-invalid={refusal !== null || undefined}>
				<FieldLabel htmlFor="reset-code">{t("Code from the mail")}</FieldLabel>
				<Input
					id="reset-code"
					name="code"
					inputMode="numeric"
					autoComplete="one-time-code"
					pattern="[0-9]{6}"
					maxLength={6}
					required
					autoFocus
					value={code}
					onChange={(event) => setCode(event.target.value)}
					aria-invalid={refusal !== null || undefined}
				/>
				{refusal ? <FieldError>{t(refusals[refusal])}</FieldError> : null}
			</Field>

			<Field>
				<FieldLabel htmlFor="reset-password">{t("New password")}</FieldLabel>
				<Input
					id="reset-password"
					name="password"
					type="password"
					autoComplete="new-password"
					required
					minLength={PASSWORD_RULES.minLength}
					maxLength={PASSWORD_RULES.maxLength}
					value={password}
					onChange={(event) => setPassword(event.target.value)}
				/>
				<FieldDescription>
					{t("At least {count} characters.", {
						count: PASSWORD_RULES.minLength,
					})}
				</FieldDescription>
			</Field>

			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				{t("Set password and sign in")}
			</Button>
		</form>
	);
}
