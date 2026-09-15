"use client";

import { signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import { signInFailureText } from "@/lib/sign-in-errors";

export type SsoProvider = {
	providerId: string;
	name: string;
};

export function SsoSignIn({ providers }: { providers: SsoProvider[] }) {
	const t = useT();
	const [pending, setPending] = useState<string | null>(null);

	function fail(failure?: { code?: string; status?: number }) {
		setPending(null);

		const { label, vars } = signInFailureText(failure);
		toast.error(t(label, vars));
	}

	async function handleClick(providerId: string) {
		setPending(providerId);

		const origin = window.location.origin;

		const { error } = await signIn.sso({
			providerId,
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/sign-in`,
		});

		if (error) fail(error);
	}

	return (
		<>
			{providers.map((provider) => (
				<Button
					key={provider.providerId}
					className="w-full"
					disabled={pending !== null}
					onClick={() => {
						handleClick(provider.providerId).catch(() => fail());
					}}
					type="button"
					variant="outline"
				>
					{pending === provider.providerId ? (
						<Spinner data-icon="inline-start" />
					) : null}
					{t("Continue with {provider}", { provider: provider.name })}
				</Button>
			))}
		</>
	);
}
