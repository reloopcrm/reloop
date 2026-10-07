"use client";

import { authClient } from "@crm/auth/client";
import type { MailboxProviderId } from "@crm/auth/scopes";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import { type MailboxLinkMode, mailboxLinkRequest } from "./mailbox-link";

const UNREACHABLE = {
	google: "Could not reach Google. Try again in a minute.",
	microsoft: "Could not reach Microsoft. Try again in a minute.",
} as const satisfies Record<MailboxProviderId, string>;

export function useMailboxLink(provider: MailboxProviderId, slug: string) {
	const t = useT();
	const [pending, setPending] = useState(false);

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? t(UNREACHABLE[provider]));
	}

	async function run(
		mode: MailboxLinkMode,
		prepare?: () => Promise<unknown>,
	): Promise<void> {
		setPending(true);

		await prepare?.();

		const { error } = await authClient.linkSocial(
			mailboxLinkRequest({
				provider,
				slug,
				origin: window.location.origin,
				mode,
			}),
		);

		if (error) fail(error.message);
	}

	return {
		pending,
		link: (mode: MailboxLinkMode, prepare?: () => Promise<unknown>) =>
			run(mode, prepare).catch(() => fail()),
	};
}

export function useReconnectedCheck(
	reconnected: boolean,
	check: () => void,
): void {
	const router = useRouter();
	const pathname = usePathname();
	const started = useRef(false);

	useMountEffect(() => {
		if (!reconnected || started.current) return;
		started.current = true;
		router.replace(pathname, { scroll: false });
		check();
	});
}
