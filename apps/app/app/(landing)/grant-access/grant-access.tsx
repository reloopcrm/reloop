"use client";

import { authClient } from "@crm/auth/client";
import {
	MAILBOX_PROVIDER_IDS,
	type MailboxProviderId,
	MICROSOFT_SYNC_SCOPES,
	SYNC_SCOPES,
} from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import type { FC, SVGProps } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import { signInFailureText } from "@/lib/sign-in-errors";
import { signOutAndRedirect } from "@/lib/sign-out";

type ProviderGrant = {
	label: string;
	scopes: readonly string[];
	Logo: FC<SVGProps<SVGSVGElement>>;
};

const PROVIDERS = {
	google: {
		label: "Grant Google access",
		scopes: [...SYNC_SCOPES],
		Logo: GoogleLogo,
	},
	microsoft: {
		label: "Grant Microsoft access",
		scopes: [...MICROSOFT_SYNC_SCOPES],
		Logo: MicrosoftLogo,
	},
} as const satisfies Record<MailboxProviderId, ProviderGrant>;

export function GrantAccess({
	providers,
}: {
	providers: readonly MailboxProviderId[];
}) {
	const t = useT();
	const [pending, setPending] = useState<MailboxProviderId | null>(null);

	function fail(failure?: { code?: string; status?: number }) {
		setPending(null);

		const { label, vars } = signInFailureText(
			failure,
			"Could not reach the provider.",
		);
		toast.error(t(label, vars));
	}

	async function handleGrant(provider: MailboxProviderId) {
		setPending(provider);

		const origin = window.location.origin;

		const { error } = await authClient.linkSocial({
			provider,
			scopes: [...PROVIDERS[provider].scopes],
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/grant-access`,
		});

		if (error) fail(error);
	}

	const single = providers.length === 1;
	const ordered = MAILBOX_PROVIDER_IDS.filter((provider) =>
		providers.includes(provider),
	);

	return (
		<div className="flex flex-col gap-3">
			{ordered.map((provider, index) => {
				const { label, Logo } = PROVIDERS[provider];

				return (
					<Button
						key={provider}
						className="w-full"
						disabled={pending !== null}
						onClick={() => {
							handleGrant(provider).catch(() => fail());
						}}
						type="button"
						variant={index === 0 ? "default" : "outline"}
					>
						{pending === provider ? (
							<Spinner data-icon="inline-start" />
						) : (
							<Logo data-icon="inline-start" className="size-4" />
						)}
						{single ? t("Grant access") : t(label)}
					</Button>
				);
			})}

			<Button
				className="w-full"
				onClick={() => {
					signOutAndRedirect().catch(() =>
						toast.error(t("Could not sign out.")),
					);
				}}
				type="button"
				variant="ghost"
			>
				{t("Sign out")}
			</Button>
		</div>
	);
}
