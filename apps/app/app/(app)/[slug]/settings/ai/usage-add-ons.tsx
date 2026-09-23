"use client";

import { Button } from "@crm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { euro } from "@/lib/billing-format";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

export function UsageAddOns() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();
	const overview = useQuery(trpc.billing.overview.queryOptions());

	const set = useMutation(
		trpc.billing.setAddOn.mutationOptions({
			onSuccess: async () => {
				toast.success(t("Add-ons updated."));
				await overview.refetch();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const data = overview.data;
	if (!data?.configured) return null;
	const hasSubscription = data.state !== "trial" && data.state !== "none";

	return (
		<section className="flex flex-col">
			<div className="pb-2">
				<h2 className="font-semibold text-md">{t("More volume")}</h2>
				<p className="text-2sm text-muted-foreground">
					{hasSubscription
						? t(
								"More room on top of your plan, billed with it. A change is invoiced right away.",
							)
						: t("Choose a plan first. Add-ons come on top of it.")}
				</p>
			</div>
			<ul className="flex flex-col">
				{data.addOnCatalog.map((addOn) => {
					const quantity = data.addOns[addOn.id] ?? 0;
					return (
						<li
							key={addOn.id}
							className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-t py-3 sm:grid-cols-[minmax(0,1fr)_--spacing(30)_auto]"
						>
							<span className="text-sm">
								{t(addOn.label)}
								{quantity > 0 ? (
									<span
										className="text-2sm text-muted-foreground tabular-nums"
										data-add-on={addOn.id}
									>
										{" · "}
										{t("× {count}", { count: quantity })}
									</span>
								) : null}
							</span>
							<span className="text-right text-sm tabular-nums">
								{euro(addOn.monthly, locale)} {t("per month")}
							</span>
							<span className="col-span-full flex items-center justify-end gap-4 sm:col-span-1">
								{quantity > 0 ? (
									<Button
										type="button"
										variant="link"
										size="sm"
										disabled={!hasSubscription || set.isPending}
										onClick={() =>
											set.mutate({ addOn: addOn.id, quantity: quantity - 1 })
										}
									>
										{t("Remove one")}
									</Button>
								) : null}
								<Button
									type="button"
									variant="link"
									size="sm"
									disabled={!hasSubscription || set.isPending}
									onClick={() =>
										set.mutate({ addOn: addOn.id, quantity: quantity + 1 })
									}
								>
									{t("Add one")}
								</Button>
							</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
