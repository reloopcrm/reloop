"use client";

import Add from "@carbon/icons-react/es/Add";
import { CURRENCIES } from "@crm/db/currency";
import type { DealStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import { DatePicker } from "@crm/ui/components/date-picker";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { BRAND } from "@crm/ui/lib/brand";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsBoolean, parseAsStringLiteral, useQueryStates } from "nuqs";
import { type ComponentProps, Suspense, useId, useState } from "react";
import { toast } from "sonner";
import { CompanyPicker } from "@/components/crm/company-picker";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { OPEN_STAGES } from "@/lib/deal-stage";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";

const UNSET = "";

const createParams = {
	[SEARCH_PARAM.dialog.create]: parseAsBoolean.withDefault(false),
	[SEARCH_PARAM.dialog.createStage]: parseAsStringLiteral(OPEN_STAGES),
};

export function CreateDealHere({ stage }: { stage: DealStage }) {
	const t = useT();
	const [, setParams] = useQueryStates(createParams);

	return (
		<Button
			variant="dashed"
			onClick={() =>
				setParams({
					[SEARCH_PARAM.dialog.create]: true,
					[SEARCH_PARAM.dialog.createStage]: stage,
				})
			}
		>
			<Icon icon={Add} data-icon="inline-start" />
			{t("Create a deal here")}
		</Button>
	);
}

function AddButton(props: ComponentProps<typeof Button>) {
	const t = useT();

	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			{t("New deal")}
		</Button>
	);
}

export function CreateDealSheet({ companyId }: { companyId?: string }) {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateDealForm companyId={companyId} />
		</Suspense>
	);
}

function CreateDealForm({ companyId }: { companyId?: string }) {
	const t = useT();
	const stageLabel = useDealStageLabel();
	const errorMessage = useErrorMessage();
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [params, setParams] = useQueryStates(createParams);
	const open = params[SEARCH_PARAM.dialog.create];
	const presetStage = params[SEARCH_PARAM.dialog.createStage];
	const [chosenStage, setStage] = useState<string | null>(null);
	const setOpen = (next: boolean | null) => {
		if (!next) setStage(null);
		return setParams({
			[SEARCH_PARAM.dialog.create]: next,
			[SEARCH_PARAM.dialog.createStage]: null,
		});
	};
	const [name, setName] = useState("");
	const [company, setCompany] = useState(companyId ?? UNSET);
	const [ownerId, setOwnerId] = useState(UNSET);
	const stage = chosenStage ?? presetStage ?? "DEMO_BOOKED";
	const [amount, setAmount] = useState("");
	const [currency, setCurrency] = useState("");
	const [closeDate, setCloseDate] = useState("");

	const nameId = useId();
	const amountId = useId();
	const closeDateId = useId();

	const users = useQuery(trpc.users.list.queryOptions());
	const me = useQuery(trpc.users.me.queryOptions());
	const currencies = useQuery(trpc.currency.settings.queryOptions());

	const resolvedOwner = ownerId || me.data?.id || UNSET;
	const workspaceCurrency = currencies.data?.reportingCurrency;
	const resolvedCurrency = currency || workspaceCurrency || "USD";

	const create = useMutation(
		trpc.deals.create.mutationOptions({
			onSuccess: async (deal) => {
				await cache.deal(deal.id);
				toast.success(t("{name} added.", { name: deal.name }));
				await setOpen(null);
				setStage(null);
				setName("");
				setAmount("");
				setCurrency("");
				setCloseDate("");
				openRecord({ kind: "deal", id: deal.id });
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const ready =
		name.trim() !== "" && company !== UNSET && resolvedOwner !== UNSET;

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>{t("New deal")}</SheetTitle>
					<SheetDescription>
						{t(
							"Every deal belongs to a company and has someone's name against it.",
						)}
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-deal"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						const parsed = Number.parseFloat(amount);
						create.mutate({
							name,
							companyId: company,
							ownerId: resolvedOwner,
							stage: stage as never,
							amountCents: Number.isFinite(parsed)
								? Math.round(parsed * 100)
								: null,
							currency: currency || workspaceCurrency,
							expectedCloseDate: closeDate || null,
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={nameId}>{t("Name")}</FieldLabel>
							<Input
								id={nameId}
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder={`Stripe · ${BRAND.name}`}
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-deal-company">
								{t("Company")}
							</FieldLabel>
							<CompanyPicker
								id="create-deal-company"
								value={company}
								onValueChange={setCompany}
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-deal-owner">{t("Owner")}</FieldLabel>
							<Select value={resolvedOwner} onValueChange={setOwnerId}>
								<SelectTrigger id="create-deal-owner">
									<SelectValue placeholder={t("Choose an owner")} />
								</SelectTrigger>
								<SelectContent>
									{(users.data ?? []).map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-deal-stage">{t("Stage")}</FieldLabel>
							<Select value={stage} onValueChange={setStage}>
								<SelectTrigger id="create-deal-stage">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{OPEN_STAGES.map((value) => (
										<SelectItem key={value} value={value}>
											{stageLabel(value)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								{t(
									"A new deal is an open deal. Close it from the pipeline once there is an outcome to record.",
								)}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={amountId}>{t("Amount")}</FieldLabel>
							<div className="flex gap-2">
								<Input
									id={amountId}
									value={amount}
									onChange={(event) => setAmount(event.target.value)}
									placeholder="24000"
									inputMode="decimal"
									autoComplete="off"
								/>
								<Select value={resolvedCurrency} onValueChange={setCurrency}>
									<SelectTrigger
										aria-label={t("Currency")}
										className="w-28 shrink-0"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{CURRENCIES.map((entry) => (
											<SelectItem key={entry.code} value={entry.code}>
												{entry.code}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</Field>

						<Field>
							<FieldLabel htmlFor={closeDateId}>
								{t("Expected close date")}
							</FieldLabel>
							<DatePicker
								id={closeDateId}
								value={closeDate}
								onChange={setCloseDate}
								placeholder={t("No date yet")}
							/>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="create-deal"
						disabled={create.isPending || !ready}
					>
						{create.isPending ? <Spinner /> : null}
						{t("Add deal")}
					</Button>
					<SheetClose asChild>
						<Button variant="outline">{t("Cancel")}</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
