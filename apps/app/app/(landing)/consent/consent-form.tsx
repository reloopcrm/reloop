"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";

type Answer = "allow" | "deny";

export function ConsentForm() {
	const t = useT();
	const [pending, setPending] = useState<Answer | null>(null);

	useMountEffect(() => {
		const reset = (event: PageTransitionEvent) => {
			if (event.persisted) setPending(null);
		};
		window.addEventListener("pageshow", reset);
		return () => window.removeEventListener("pageshow", reset);
	});

	async function answer(choice: Answer) {
		setPending(choice);

		const { data, error } = await authClient.oauth2.consent({
			accept: choice === "allow",
		});

		if (error || !data?.url) {
			setPending(null);
			toast.error(
				t("Could not finish the connection. Start again from the assistant."),
			);
			return;
		}

		window.location.assign(data.url);
	}

	return (
		<div className="flex flex-wrap items-center gap-4">
			<Button
				type="button"
				disabled={pending !== null}
				onClick={() => answer("allow")}
			>
				{pending === "allow" ? <Spinner /> : null}
				{t("Allow")}
			</Button>
			<Button
				type="button"
				variant="link"
				disabled={pending !== null}
				onClick={() => answer("deny")}
			>
				{t("Deny")}
			</Button>
		</div>
	);
}
