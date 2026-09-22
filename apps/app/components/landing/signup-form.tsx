"use client";

import { signIn } from "@crm/auth/client";
import { PASSWORD_RULES } from "@crm/auth/password-rules";
import { PLANS, type PlanId } from "@crm/db/plans";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Link } from "@crm/ui/components/link";
import { Spinner } from "@crm/ui/components/spinner";
import type {
	TenantSignInMethod,
	TenantSignupResult,
} from "@crm/validation/tenant-signup";
import NextLink from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { SocialSignIn } from "@/app/(landing)/sign-in/social-sign-in";
import { useLocale, useT } from "@/lib/i18n/client";
import { PROXY } from "@/lib/proxy-config";
import { signInFailureText } from "@/lib/sign-in-errors";
import {
	resendSignupCode,
	signUpWorkspace,
	type TenantRefusal,
	verifyWorkspace,
} from "@/lib/tenant-api";

const REFUSALS = {
	NO_WORKSPACE: "No workspace for this address.",
	WORKSPACE_EXISTS: "A workspace for this address already exists.",
	TOO_MANY_REQUESTS:
		"Too many sign-ups from here. Wait a minute and try again.",
	NOT_HOSTED: "This server has no hosted workspaces.",
	NO_MAIL: "This server sends no mail. Continue with Google or Microsoft.",
	CODE_INVALID: "That code is not right. Check the mail and try again.",
	CODE_EXPIRED: "That code has expired. Ask for a new one.",
	CODE_LOCKED: "Too many wrong codes. Ask for a new one.",
	INVALID: "Check your details and try again.",
	FAILED: "That did not work. Try again in a moment.",
} satisfies Record<TenantRefusal, string>;

const OAUTH_PROVIDERS = ["google", "microsoft"] as const;

type Provider = (typeof OAUTH_PROVIDERS)[number];

function providersOf(methods: readonly TenantSignInMethod[]): Provider[] {
	return OAUTH_PROVIDERS.filter((provider) => methods.includes(provider));
}

export function SignupForm({
	plan,
	pricingHref,
	withPassword,
	signInMethods,
}: {
	plan: PlanId;
	pricingHref: string;
	withPassword: boolean;
	signInMethods: readonly TenantSignInMethod[];
}) {
	const t = useT();
	const locale = useLocale();
	const id = useId();
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [company, setCompany] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [refusal, setRefusal] = useState<TenantRefusal | null>(null);
	const [done, setDone] = useState<TenantSignupResult | null>(null);
	const [resent, setResent] = useState(false);

	function fail(code: TenantRefusal) {
		setPending(false);
		setRefusal(code);
	}

	async function handleSubmit() {
		setPending(true);
		setRefusal(null);

		const outcome = await signUpWorkspace({
			email: email.trim(),
			name: name.trim(),
			company: company.trim(),
			plan,
			locale,
			password: withPassword ? password : undefined,
		});
		setPending(false);

		if (outcome.ok) setDone(outcome.data);
		else setRefusal(outcome.code);
	}

	async function handleVerify() {
		setPending(true);
		setRefusal(null);

		const outcome = await verifyWorkspace({ email: email.trim(), code });
		if (!outcome.ok) {
			fail(outcome.code);
			return;
		}

		const { error } = await signIn.email({
			email: email.trim(),
			password,
			callbackURL: `${window.location.origin}/`,
		});
		if (error) {
			setPending(false);
			const { label, vars } = signInFailureText(error);
			toast.error(t(label, vars));
		}
	}

	async function handleResend() {
		setPending(true);
		setRefusal(null);
		setResent(false);

		const outcome = await resendSignupCode({ email: email.trim() });
		setPending(false);

		if (outcome.ok) setResent(true);
		else setRefusal(outcome.code);
	}

	if (done?.next === "verify-email") {
		const providers = providersOf(signInMethods);

		return (
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					handleVerify().catch(() => fail("FAILED"));
				}}
			>
				<p role="status" className="text-body-foreground text-sm/6">
					{t("We sent a code to {email}. Enter it here.", {
						email: email.trim(),
					})}
				</p>

				<Field data-invalid={refusal !== null || undefined}>
					<FieldLabel htmlFor={`${id}-code`}>
						{t("Code from the mail")}
					</FieldLabel>
					<Input
						id={`${id}-code`}
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
					{refusal ? (
						<FieldError>{t(REFUSALS[refusal])}</FieldError>
					) : resent ? (
						<FieldDescription>
							{t("A new code is on its way.")}
						</FieldDescription>
					) : null}
				</Field>

				<Button type="submit" disabled={pending}>
					{pending ? <Spinner data-icon="inline-start" /> : null}
					{t("Open workspace")}
				</Button>

				<Button
					type="button"
					variant="ghost"
					disabled={pending}
					onClick={() => {
						handleResend().catch(() => fail("FAILED"));
					}}
				>
					{t("Send the code again")}
				</Button>

				{providers.length > 0 ? (
					<div className="flex flex-col gap-3">
						<p className="text-muted-foreground text-sm/6">
							{t("No mail? Sign in with the same address instead.")}
						</p>
						{providers.map((provider) => (
							<SocialSignIn key={provider} provider={provider} />
						))}
					</div>
				) : null}
			</form>
		);
	}

	if (done) {
		const providers = done.provider ? [done.provider] : OAUTH_PROVIDERS;

		return (
			<div className="flex flex-col gap-4">
				<p role="status" className="text-body-foreground text-sm/6">
					{t("Your workspace is ready. Sign in to open it.")}
				</p>
				<div className="flex flex-col gap-3">
					{providers.map((provider, index) => (
						<SocialSignIn
							key={provider}
							provider={provider}
							only={index === 0}
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				handleSubmit().catch(() => fail("FAILED"));
			}}
		>
			<Field data-invalid={refusal !== null || undefined}>
				<FieldLabel htmlFor={`${id}-email`}>{t("Work email")}</FieldLabel>
				<Input
					id={`${id}-email`}
					name="email"
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					aria-invalid={refusal !== null || undefined}
				/>
				{refusal ? (
					<FieldError>
						{t(REFUSALS[refusal])}
						{refusal === "WORKSPACE_EXISTS" ? (
							<>
								{" "}
								<Link variant="inline" asChild>
									<NextLink href={PROXY.path.signIn}>{t("Sign in")}</NextLink>
								</Link>
							</>
						) : null}
					</FieldError>
				) : null}
			</Field>

			<Field>
				<FieldLabel htmlFor={`${id}-name`}>{t("Your name")}</FieldLabel>
				<Input
					id={`${id}-name`}
					name="name"
					autoComplete="name"
					required
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
			</Field>

			<Field>
				<FieldLabel htmlFor={`${id}-company`}>{t("Company")}</FieldLabel>
				<Input
					id={`${id}-company`}
					name="company"
					autoComplete="organization"
					required
					value={company}
					onChange={(event) => setCompany(event.target.value)}
				/>
			</Field>

			{withPassword ? (
				<Field>
					<FieldLabel htmlFor={`${id}-password`}>{t("Password")}</FieldLabel>
					<Input
						id={`${id}-password`}
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
			) : null}

			<p className="text-muted-foreground text-sm/6">
				{t("Plan: {plan}.", { plan: t(PLANS[plan].label) })}{" "}
				<Link variant="inline" asChild>
					<NextLink href={pricingHref}>{t("Change plan")}</NextLink>
				</Link>
			</p>

			<Button type="submit" disabled={pending}>
				{pending ? <Spinner data-icon="inline-start" /> : null}
				{t("Start free trial")}
			</Button>
		</form>
	);
}
