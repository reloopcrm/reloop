"use client";

import Add from "@carbon/icons-react/es/Add";
import Subtract from "@carbon/icons-react/es/Subtract";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BillingChangeDialog } from "@/components/billing-change-dialog";
import { euro, longDay, signedEuro } from "@/lib/billing-format";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type AddOn = RouterOutputs["billing"]["overview"]["addOnCatalog"][number];

type Step = { addOn: AddOn; from: number; to: number };

export function UsageAddOns() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const router = useRouter();
	const errorMessage = useErrorMessage();
	const overview = useQuery(trpc.billing.overview.queryOptions());
	const [step, setStep] = useState<Step | null>(null);

	const set = useMutation(
		trpc.billing.setAddOn.mutationOptions({
			onSuccess: async ({ url }) => {
				if (url) {
					window.location.assign(url);
					return;
				}
				setStep(null);
				toast.success(t("Add-ons updated."));
				await overview.refetch();
				router.refresh();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const data = overview.data;
	if (!data?.configured) return null;
	const hasSubscription = data.state !== "trial" && data.state !== "none";
	const periodEnd = data.scheduled?.at ?? data.paidUntil;

	return (
		<section className="flex flex-col">
			<div className="pb-2">
				<h2 className="font-semibold text-md">{t("More volume")}</h2>
				<p className="text-2sm text-muted-foreground">
					{hasSubscription
						? t(
								"More room on top of your plan, billed with it. You see the price before anything changes.",
							)
						: t("Choose a plan first. Add-ons come on top of it.")}
				</p>
			</div>
			<ul className="flex flex-col">
				{data.addOnCatalog.map((addOn) => {
					const quantity = data.addOns[addOn.id] ?? 0;
					const later = data.scheduled?.addOns[addOn.id];
					const base = later ?? quantity;
					const label = t(addOn.label);
					return (
						<li
							key={addOn.id}
							className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-t py-3 sm:grid-cols-[minmax(0,1fr)_--spacing(30)_auto]"
						>
							<span className="text-sm">{label}</span>
							<span className="text-right text-sm tabular-nums">
								{euro(addOn.monthly, locale)} {t("per month")}
							</span>
							<span className="col-span-full flex items-center justify-end gap-3 sm:col-span-1">
								<Button
									type="button"
									variant="destructive"
									size="icon-sm"
									aria-label={t("One less: {label}", { label })}
									disabled={!hasSubscription || base === 0 || set.isPending}
									onClick={() => setStep({ addOn, from: base, to: base - 1 })}
								>
									<Icon icon={Subtract} />
								</Button>
								<span
									className="flex min-w-6 flex-col items-center text-center text-sm tabular-nums"
									data-add-on={addOn.id}
								>
									{quantity}
									{later !== undefined && later !== quantity && periodEnd ? (
										<span
											className="text-2sm text-muted-foreground"
											data-add-on-later={addOn.id}
										>
											{t("{count} from {date}", {
												count: later,
												date: longDay(periodEnd, locale),
											})}
										</span>
									) : null}
								</span>
								<Button
									type="button"
									variant="success"
									size="icon-sm"
									aria-label={t("One more: {label}", { label })}
									disabled={!hasSubscription || set.isPending}
									onClick={() =>
										setStep({ addOn, from: quantity, to: quantity + 1 })
									}
								>
									<Icon icon={Add} />
								</Button>
							</span>
						</li>
					);
				})}
			</ul>
			{step ? (
				<AddOnConfirm
					step={step}
					periodEnd={periodEnd}
					scheduledAt={data.scheduled?.at ?? null}
					pending={set.isPending}
					onConfirm={() =>
						set.mutate({ addOn: step.addOn.id, quantity: step.to })
					}
					onClose={() => setStep(null)}
				/>
			) : null}
		</section>
	);
}

function AddOnConfirm({
	step,
	periodEnd,
	scheduledAt,
	pending,
	onConfirm,
	onClose,
}: {
	step: Step;
	periodEnd: string | null;
	scheduledAt: string | null;
	pending: boolean;
	onConfirm: () => void;
	onClose: () => void;
}) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const adding = step.to > step.from;
	const preview = useQuery({
		...trpc.billing.previewAddOn.queryOptions({
			addOn: step.addOn.id,
			quantity: step.to,
		}),
		enabled: adding,
	});
	const label = t(step.addOn.label);
	const change = (step.to - step.from) * step.addOn.monthly;
	const date = periodEnd
		? longDay(periodEnd, locale)
		: t("the end of the period");
	const lines = [
		adding
			? t("You then have {count}.", { count: step.to })
			: t("From {date} you have {count}.", { date, count: step.to }),
		t("Your monthly cost changes by {amount}.", {
			amount: signedEuro(change, locale),
		}),
	];
	if (adding && scheduledAt) {
		lines.push(
			t("This replaces the change scheduled for {date}.", {
				date: longDay(scheduledAt, locale),
			}),
		);
	}

	return (
		<BillingChangeDialog
			title={
				adding ? t("Add {label}?", { label }) : t("Remove {label}?", { label })
			}
			lines={lines}
			preview={adding ? { data: preview.data, error: preview.error } : null}
			note={
				adding
					? t("It applies at once. The limit rises as soon as Stripe confirms.")
					: t(
							"It applies at the end of the period. Until then your add-ons stay, and nothing is charged or credited now.",
						)
			}
			confirmLabel={t("Confirm")}
			pending={pending}
			onConfirm={onConfirm}
			onClose={onClose}
		/>
	);
}
