"use client";

import { signIn } from "@crm/auth/client";
import type { MailboxProviderId } from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import type { FC, SVGProps } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import { signInFailureText } from "@/lib/sign-in-errors";

const LOGOS = {
	google: GoogleLogo,
	microsoft: MicrosoftLogo,
} as const satisfies Record<MailboxProviderId, FC<SVGProps<SVGSVGElement>>>;

export function SocialSignIn({
	provider,
	only = false,
}: {
	provider: MailboxProviderId;
	only?: boolean;
}) {
	const t = useT();
	const [pending, setPending] = useState(false);

	const Logo = LOGOS[provider];
	const label =
		provider === "google"
			? t("Continue with Google")
			: t("Continue with Microsoft");

	function fail(failure?: { code?: string; status?: number }) {
		setPending(false);

		const { label, vars } = signInFailureText(failure);
		toast.error(t(label, vars));
	}

	async function handleClick() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await signIn.social({
			provider,
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/sign-in`,
		});

		if (error) fail(error);
	}

	return (
		<Button
			className="w-full"
			disabled={pending}
			onClick={() => {
				handleClick().catch(() => fail());
			}}
			type="button"
			variant={only ? "default" : "outline"}
		>
			{pending ? (
				<Spinner data-icon="inline-start" />
			) : (
				<Logo data-icon="inline-start" className="size-4" />
			)}
			{label}
		</Button>
	);
}
