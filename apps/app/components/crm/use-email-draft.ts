"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n/client";
import { translateError } from "@/lib/i18n/errors";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import { EMAIL_DRAFT } from "./email-draft-config";

export function mailtoHref(email: string, subject: string, body: string) {
	return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function mailtoFits(href: string): boolean {
	return href.length <= EMAIL_DRAFT.mailtoMaxChars;
}

export async function copyText(text: string, t: Translate): Promise<boolean> {
	const clipboard = navigator.clipboard;
	if (!clipboard) {
		toast.error(t("This browser does not allow copying."));
		return false;
	}

	try {
		await clipboard.writeText(text);
		toast.success(t("Email copied."));
		return true;
	} catch {
		toast.error(t("This browser does not allow copying."));
		return false;
	}
}

export function useEmailDraft(
	contactId: string,
	enabled: boolean,
	onWritten?: () => void,
) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const queries = useQueryClient();

	const state = useQuery({
		...trpc.contacts.draft.queryOptions({ id: contactId }),
		enabled,
		refetchInterval: (query) =>
			query.state.data?.queued ? EMAIL_DRAFT.pollMs : false,
	});

	const write = useMutation(
		trpc.contacts.writeDraft.mutationOptions({
			onSuccess: (result) => {
				onWritten?.();
				queries.setQueryData(
					trpc.contacts.draft.queryKey({ id: contactId }),
					result,
				);
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const ensure = async () => {
		try {
			const current = await queries.fetchQuery(
				trpc.contacts.draft.queryOptions({ id: contactId }),
			);
			if (
				!current.draft &&
				!current.queued &&
				!current.waitingUntil &&
				current.limit === null
			) {
				write.mutate({ id: contactId });
			}
		} catch (error) {
			toast.error(
				translateError(t, locale, error instanceof Error ? error.message : ""),
			);
		}
	};

	const waiting = state.data?.queued === true || write.isPending;
	const held = state.data?.waitingUntil ?? null;

	return {
		state,
		draft: state.data?.draft ?? null,
		failed: state.data?.failed === true,
		held,
		planLimit: state.data?.limit === "plan",
		waiting,
		blocked: waiting || held !== null,
		write: (instruction?: string) =>
			write.mutate(
				instruction ? { id: contactId, instruction } : { id: contactId },
			),
		ensure,
	};
}
