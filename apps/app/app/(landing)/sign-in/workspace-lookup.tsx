"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldError, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Link } from "@crm/ui/components/link";
import { Spinner } from "@crm/ui/components/spinner";
import type { TenantLookupResult } from "@crm/validation/tenant-signup";
import NextLink from "next/link";
import { useState } from "react";
import { PRICING } from "@/components/landing/pricing/config";
import { useT } from "@/lib/i18n/client";
import { lookupWorkspace, type TenantRefusal } from "@/lib/tenant-api";
import { PasswordSignIn } from "./password-sign-in";
import { SocialSignIn } from "./social-sign-in";

const REFUSALS = {
	NO_WORKSPACE: "No workspace for this address.",
	WORKSPACE_EXISTS: "A workspace for this address already exists.",
	TOO_MANY_REQUESTS: "Too many tries. Wait a moment, then start again.",
	INVALID: "Check the address and try again.",
	FAILED: "Could not reach the sign-in service.",
} satisfies Record<TenantRefusal, string>;

export function WorkspaceLookup() {
	const t = useT();
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [refusal, setRefusal] = useState<TenantRefusal | null>(null);
	const [found, setFound] = useState<TenantLookupResult | null>(null);

	async function handleSubmit() {
		setPending(true);
		setRefusal(null);

		const outcome = await lookupWorkspace({ email: email.trim() });
		setPending(false);

		if (outcome.ok) setFound(outcome.data);
		else setRefusal(outcome.code);
	}

	if (found) {
		const social = found.signIn.filter((method) => method !== "email");
		const password = found.signIn.includes("email");

		return (
			<div className="flex flex-col gap-4">
				{password ? <PasswordSignIn /> : null}
				<div className="flex flex-col gap-3">
					{social.map((provider, index) => (
						<SocialSignIn
							key={provider}
							provider={provider}
							only={!password && index === 0}
						/>
					))}
				</div>
				<Button
					type="button"
					variant="ghost"
					onClick={() => {
						setFound(null);
					}}
				>
					{t("Use a different email address")}
				</Button>
			</div>
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
				<FieldLabel htmlFor="workspace-email">{t("Work email")}</FieldLabel>
				<Input
					id="workspace-email"
					name="email"
					type="email"
					autoComplete="username"
					required
					autoFocus
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					aria-invalid={refusal !== null || undefined}
				/>
				{refusal ? (
					<FieldError>
						{t(REFUSALS[refusal])}
						{refusal === "NO_WORKSPACE" ? (
							<>
								{" "}
								<Link variant="inline" asChild>
									<NextLink href={PRICING.href.start}>
										{t("Create one")}
									</NextLink>
								</Link>
							</>
						) : null}
					</FieldError>
				) : null}
			</Field>

			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				{t("Continue")}
			</Button>
		</form>
	);
}
