"use client";

import MagicWand from "@carbon/icons-react/es/MagicWand";
import Renew from "@carbon/icons-react/es/Renew";
import { DropdownMenuItem } from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function EnrichmentActions({
	companyId,
	hasDomain,
}: {
	companyId: string;
	hasDomain: boolean;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const enrich = useMutation(
		trpc.companies.enrich.mutationOptions({
			onSuccess: async (result) => {
				await cache.company(companyId);
				toast.success(
					result.queued
						? t("Looking it up. This page will update when it finishes.")
						: t("Already running."),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const research = useMutation(
		trpc.companies.research.mutationOptions({
			onSuccess: async (result) => {
				await cache.activity();
				toast.success(
					result.queued
						? t(
								"Researching. The company card fills in from the website when it finishes.",
							)
						: t("Already researching."),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<>
			<DropdownMenuItem
				disabled={!hasDomain || enrich.isPending}
				onSelect={() => enrich.mutate({ id: companyId })}
			>
				<Icon icon={Renew} />
				{t("Re-enrich")}
			</DropdownMenuItem>

			<DropdownMenuItem
				disabled={!hasDomain || research.isPending}
				onSelect={() => research.mutate({ id: companyId })}
			>
				<Icon icon={MagicWand} />
				{t("Research")}
			</DropdownMenuItem>
		</>
	);
}

export function ContactEnrichmentAction({ contactId }: { contactId: string }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const enrich = useMutation(
		trpc.contacts.enrich.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact(contactId);
				toast.success(
					result.queued
						? t("Taking another look. This page will update when it finishes.")
						: t("Already running."),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<DropdownMenuItem
			disabled={enrich.isPending}
			onSelect={() => enrich.mutate({ id: contactId })}
		>
			<Icon icon={Renew} />
			{t("Re-enrich")}
		</DropdownMenuItem>
	);
}
