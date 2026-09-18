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

type ProviderChoice = {
	label: string;
	Logo: FC<SVGProps<SVGSVGElement>>;
};

const PROVIDERS = {
	google: { label: "Continue with Google", Logo: GoogleLogo },
	microsoft: { label: "Continue with Microsoft", Logo: MicrosoftLogo },
} as const satisfies Record<MailboxProviderId, ProviderChoice>;

export function SocialSignIn({
	provider,
	only = false,
}: {
	provider: MailboxProviderId;
	only?: boolean;
}) {
	const t = useT();
	const [pending, setPending] = useState(false);

	const { label, Logo } = PROVIDERS[provider];

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
			{t(label)}
		</Button>
	);
}
