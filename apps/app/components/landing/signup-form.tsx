"use client";

import { PLANS, type PlanId } from "@crm/db/plans";
import { Button } from "@crm/ui/components/button";
import { Field, FieldError, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Link } from "@crm/ui/components/link";
import { Spinner } from "@crm/ui/components/spinner";
import type { TenantSignupResult } from "@crm/validation/tenant-signup";
import NextLink from "next/link";
import { useId, useState } from "react";
import { SocialSignIn } from "@/app/(landing)/sign-in/social-sign-in";
import { PRICING } from "@/components/landing/page-blocks";
import { useLocale, useT } from "@/lib/i18n/client";
import { PROXY } from "@/lib/proxy-config";
import { signUpWorkspace, type TenantRefusal } from "@/lib/tenant-api";

const REFUSALS = {
	NO_WORKSPACE: "No workspace for this address.",
	WORKSPACE_EXISTS: "A workspace for this address already exists.",
	TOO_MANY_REQUESTS:
		"Too many sign-ups from here. Wait a minute and try again.",
	INVALID: "Check your details and try again.",
	FAILED: "That did not work. Try again in a moment.",
} satisfies Record<TenantRefusal, string>;

export function SignupForm({ plan }: { plan: PlanId }) {
	const t = useT();
	const locale = useLocale();
	const id = useId();
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [company, setCompany] = useState("");
	const [pending, setPending] = useState(false);
	const [refusal, setRefusal] = useState<TenantRefusal | null>(null);
	const [done, setDone] = useState<TenantSignupResult | null>(null);

	async function handleSubmit() {
		setPending(true);
		setRefusal(null);

		const outcome = await signUpWorkspace({
			email: email.trim(),
			name: name.trim(),
			company: company.trim(),
			plan,
			locale,
		});
		setPending(false);

		if (outcome.ok) setDone(outcome.data);
		else setRefusal(outcome.code);
	}

	if (done?.next === "oauth" && done.provider) {
		return (
			<div className="flex flex-col gap-4">
				<p role="status" className="text-body-foreground text-sm/6">
					{t("Your workspace is ready. Sign in to open it.")}
				</p>
				<SocialSignIn provider={done.provider} only />
			</div>
		);
	}

	if (done) {
		return (
			<p role="status" className="text-body-foreground text-sm/6">
				{t("Check your inbox. We sent a sign-in link to {email}.", { email })}
			</p>
		);
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				handleSubmit().catch(() => {
					setPending(false);
					setRefusal("FAILED");
				});
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

			<p className="text-muted-foreground text-sm/6">
				{t("Plan: {plan}.", { plan: t(PLANS[plan].label) })}{" "}
				<Link variant="inline" asChild>
					<NextLink href={PRICING.href}>{t("Change plan")}</NextLink>
				</Link>
			</p>

			<Button type="submit" disabled={pending}>
				{pending ? <Spinner data-icon="inline-start" /> : null}
				{t("Start free trial")}
			</Button>
		</form>
	);
}
