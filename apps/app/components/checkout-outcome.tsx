"use client";

import Purchase from "@carbon/icons-react/es/Purchase";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Spinner } from "@crm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CHECKOUT } from "@/lib/checkout-config";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

export function CheckoutOutcome() {
	const t = useT();
	const trpc = useTRPC();
	const [startedAt] = useState(() => Date.now());
	const waited = (at: number) => at - startedAt > CHECKOUT.poll.maxMs;
	const overview = useQuery({
		...trpc.billing.overview.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.state === "active" || waited(query.state.dataUpdatedAt)
				? false
				: CHECKOUT.poll.intervalMs,
	});
	const data = overview.data;
	const fetchedAt = overview.dataUpdatedAt;

	if (data?.state === "active") {
		return (
			<Alert>
				<Purchase />
				<AlertTitle>
					{t("Thanks, the {plan} plan is active.", { plan: t(data.label) })}
				</AlertTitle>
				<AlertDescription>
					{t("Set up your workspace below. Invoices are under Plan & billing.")}
				</AlertDescription>
			</Alert>
		);
	}

	if (data && waited(fetchedAt)) {
		return (
			<Alert variant="warning">
				<Purchase />
				<AlertTitle>
					{t("The confirmation takes longer than usual.")}
				</AlertTitle>
				<AlertDescription>
					{t(
						"Your payment is safe. The plan shows under Plan & billing as soon as Stripe confirms it.",
					)}
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Alert>
			<Spinner />
			<AlertTitle>{t("We are confirming your payment.")}</AlertTitle>
			<AlertDescription>
				{t("Stripe told us you paid. The plan shows here in a moment.")}
			</AlertDescription>
		</Alert>
	);
}
