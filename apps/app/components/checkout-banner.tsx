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
import type { ComponentProps, ReactNode } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

export type CheckoutBannerProps = { wanted: PlanPurchase; label: string };

export function CheckoutButton({
	purchase,
	variant,
	children,
}: {
	purchase: PlanPurchase;
	variant?: ComponentProps<typeof Button>["variant"];
	children: ReactNode;
}) {
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
		<Button
			variant={variant}
			disabled={checkout.isPending}
			onClick={() => checkout.mutate(purchase)}
		>
			{checkout.isPending ? <Spinner data-icon="inline-start" /> : null}
			{children}
		</Button>
	);
}

export function CheckoutBanner({ wanted, label }: CheckoutBannerProps) {
	const t = useT();

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
				<CheckoutButton purchase={wanted} variant="outline">
					{t("Complete the {plan} plan", { plan: t(label) })}
				</CheckoutButton>
			</AlertAction>
		</Alert>
	);
}
