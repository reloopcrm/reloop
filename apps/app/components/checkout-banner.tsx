"use client";

import Purchase from "@carbon/icons-react/es/Purchase";
import type { PlanPurchase } from "@crm/db/pricing";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

export type CheckoutBannerProps = { wanted: PlanPurchase; label: string };

export function CheckoutBanner({ wanted, label }: CheckoutBannerProps) {
	const t = useT();
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();
	const checkout = useMutation(
		trpc.billing.checkout.mutationOptions({
			onSuccess: ({ url }) => {
				if (url) window.location.assign(url);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<Alert size="banner">
			<Purchase />
			<AlertTitle>
				{t("{plan} is chosen but not paid yet.", { plan: t(label) })}
			</AlertTitle>
			<AlertDescription>
				{t(
					"Your workspace runs on the trial until you pay. The whole plan is active right after.",
				)}
			</AlertDescription>
			<AlertAction>
				<Button
					variant="outline"
					disabled={checkout.isPending}
					onClick={() => checkout.mutate(wanted)}
				>
					{checkout.isPending ? <Spinner data-icon="inline-start" /> : null}
					{t("Complete the {plan} plan", { plan: t(label) })}
				</Button>
			</AlertAction>
		</Alert>
	);
}
