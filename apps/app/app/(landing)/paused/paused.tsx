"use client";

import { Button } from "@crm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import {
	longDay,
	PlanPicker,
} from "../../(app)/[slug]/settings/billing/billing";

const PAUSED = { refetchMs: 5_000, home: "/" } as const;

export function Paused({ admin }: { admin: boolean }) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();
	const [picking, setPicking] = useState(false);

	const overview = useQuery({
		...trpc.billing.overview.queryOptions(),
		enabled: admin,
		refetchInterval: PAUSED.refetchMs,
	});

	const portal = useMutation(
		trpc.billing.portal.mutationOptions({
			onSuccess: ({ url }) => window.location.assign(url),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const data = overview.data;
	const suspended = data?.suspended ?? true;

	useEffect(() => {
		if (data && !suspended) window.location.assign(PAUSED.home);
	}, [data, suspended]);

	if (!admin) {
		return (
			<p className="text-pretty text-muted-foreground text-sm/5">
				{t("Ask a workspace owner or admin to choose a plan.")}
			</p>
		);
	}

	if (!data) return null;

	const reason =
		data.state === "trial"
			? t("Your trial has ended.")
			: data.state === "past_due"
				? t("The last payment failed.")
				: t("Your plan has ended.");

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1 text-sm/5">
				<p>{reason}</p>
				{data.deleteAt ? (
					<p className="text-muted-foreground">
						{t("All its data is deleted for good on {date}.", {
							date: longDay(data.deleteAt, locale),
						})}
					</p>
				) : null}
			</div>

			{!data.configured ? (
				<p className="text-muted-foreground text-sm/5">
					{t("Billing is not set up on this install.")}{" "}
					{t(
						"Your operator manages this plan. Contact them to change your limits.",
					)}
				</p>
			) : picking ? (
				<PlanPicker data={data} onDone={() => setPicking(false)} />
			) : (
				<div className="flex flex-col gap-3">
					<Button type="button" onClick={() => setPicking(true)}>
						{t("Choose a plan to continue")}
					</Button>
					{data.state === "past_due" ? (
						<Button
							type="button"
							variant="outline"
							disabled={portal.isPending}
							onClick={() => portal.mutate({ flow: "payment_method" })}
						>
							{t("Fix payment method")}
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}
