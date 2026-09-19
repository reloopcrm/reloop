"use client";

import Settings from "@carbon/icons-react/es/Settings";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
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
import { Switch } from "@crm/ui/components/switch";
import {
	Textarea as BusinessTextarea,
	Textarea,
} from "@crm/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { unitLabel } from "./win-back-verdict";

export type WinBackRules = RouterOutputs["reactivation"]["rules"];

const FORM = "win-back-rules";

type PointKey = keyof WinBackRules["points"];

const POINT_FIELDS: { key: PointKey; label: string; hint: string }[] = [
	{
		key: "waitingOnUs",
		label: "Their last email is unanswered",
		hint: "Once per person.",
	},
	{ key: "perEmailFromThem", label: "Each email they sent you", hint: "" },
	{ key: "perEmailFromUs", label: "Each email you sent them", hint: "" },
	{ key: "perMeeting", label: "Each meeting", hint: "From the calendar." },
	{ key: "openDeal", label: "Each open deal", hint: "" },
	{ key: "wonDeal", label: "Each won deal", hint: "" },
	{
		key: "hasCompany",
		label: "Belongs to a company",
		hint: "People on free mail providers usually do not.",
	},
	{
		key: "titleKeyword",
		label: "Job title matches a keyword",
		hint: "Keywords below, once per person.",
	},
	{
		key: "pastBusiness",
		label: "Each deal done with them before",
		hint: "Read from the conversations.",
	},
	{
		key: "openInquiry",
		label: "Each inquiry of theirs left open",
		hint: "They asked, nothing was agreed.",
	},
	{
		key: "bigQuantity",
		label: "Asked for at least the minimum quantity",
		hint: "Minimum set below.",
	},
	{
		key: "productMatch",
		label: "Talks about your products",
		hint: "Product list below.",
	},
	{
		key: "sideProductMatch",
		label: "Talks only about side ware",
		hint: "Side ware list below. Keep it under the line above.",
	},
	{
		key: "goodFeedback",
		label: "You marked them as worth it",
		hint: "",
	},
];

function lines(value: string): string[] {
	return value
		.split(/[\n,]/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function WinBackRulesSheet({ rules }: { rules: WinBackRules }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const canManage = workspace.data?.canRename === true;
	const id = useId();

	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<WinBackRules>(rules);
	const [keywords, setKeywords] = useState(rules.titleKeywords.join("\n"));
	const [products, setProducts] = useState(rules.business.products.join("\n"));
	const [sideProducts, setSideProducts] = useState(
		rules.business.sideProducts.join("\n"),
	);
	const [domains, setDomains] = useState(rules.excludedDomains.join("\n"));

	const state = useQuery({
		...trpc.reactivation.rulesState.queryOptions(),
		refetchInterval: (query) => (query.state.data?.tuning ? 5_000 : false),
	});
	const mode = state.data?.mode ?? "auto";

	const setMode = useMutation(
		trpc.reactivation.setRulesMode.mutationOptions({
			onSuccess: async (next) => {
				await cache.winBack();
				toast.success(
					next.mode === "auto"
						? t("The agent now sets the rules from your verdicts.")
						: t("You set the rules yourself now."),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const tune = useMutation(
		trpc.reactivation.tuneRulesNow.mutationOptions({
			onSuccess: async () => {
				await cache.winBack();
				toast.success(t("The agent is re-tuning the rules. Takes a minute."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const save = useMutation(
		trpc.reactivation.setRules.mutationOptions({
			onSuccess: async () => {
				await cache.winBack();
				setOpen(false);
				toast.success(t("Rules saved. The list is re-ranked."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	function reset() {
		setDraft(rules);
		setKeywords(rules.titleKeywords.join("\n"));
		setProducts(rules.business.products.join("\n"));
		setSideProducts(rules.business.sideProducts.join("\n"));
		setDomains(rules.excludedDomains.join("\n"));
	}

	function setBusiness<K extends keyof WinBackRules["business"]>(
		key: K,
		value: WinBackRules["business"][K],
	) {
		setDraft((current) => ({
			...current,
			business: { ...current.business, [key]: value },
		}));
	}

	function setInclude<K extends keyof WinBackRules["include"]>(
		key: K,
		value: WinBackRules["include"][K],
	) {
		setDraft((current) => ({
			...current,
			include: { ...current.include, [key]: value },
		}));
	}

	function setPoints(key: PointKey, value: number) {
		setDraft((current) => ({
			...current,
			points: { ...current.points, [key]: value },
		}));
	}

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) reset();
			}}
		>
			<SheetTrigger asChild>
				<Button variant="outline" size="sm" disabled={!canManage}>
					<Icon icon={Settings} data-icon="inline-start" />
					{t("Rules")}
				</Button>
			</SheetTrigger>

			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>{t("What counts as worth winning back")}</SheetTitle>
					<SheetDescription>
						{t(
							"The list shows everyone who passes the filters, ranked by the weight of each fact. The agent can set the weighting from your verdicts, or you set it yourself.",
						)}
					</SheetDescription>
				</SheetHeader>

				<form
					id={FORM}
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate({
							keepMode: mode === "auto",
							rules: {
								...draft,
								business: {
									...draft.business,
									products: lines(products),
									sideProducts: lines(sideProducts),
								},
								titleKeywords: lines(keywords),
								excludedDomains: lines(domains).map((entry) =>
									entry.toLowerCase(),
								),
							},
						});
					}}
				>
					<div className="flex flex-col gap-3 pb-4">
						<ToggleGroup
							disabled={!canManage}
							type="single"
							wrap
							value={mode}
							onValueChange={(value) => {
								if (value === "auto" || value === "manual") {
									setMode.mutate({ mode: value });
								}
							}}
						>
							<ToggleGroupItem value="auto">
								{t("Agent sets the rules (recommended)")}
							</ToggleGroupItem>
							<ToggleGroupItem value="manual">
								{t("I set them myself")}
							</ToggleGroupItem>
						</ToggleGroup>

						{state.data?.playbook ? (
							<div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
								<p className="text-muted-foreground text-xs">
									{t(
										"What the agent learned from {count} of your sent emails",
										{
											count: state.data.playbook.sentEmails,
										},
									)}
									{state.data.playbook.learnedAt ? (
										<>
											{" "}
											·{" "}
											<LocalRelativeTime date={state.data.playbook.learnedAt} />
										</>
									) : null}
								</p>
								<p className="line-clamp-4">{state.data.playbook.summary}</p>
								<Collapsible>
									<CollapsibleTrigger asChild>
										<Button type="button" variant="ghost" size="xs">
											{t("Show details")}
										</Button>
									</CollapsibleTrigger>
									<CollapsibleContent className="flex flex-col gap-2 pt-2">
										<p>{state.data.playbook.summary}</p>
										{state.data.playbook.offers.length > 0 ? (
											<p className="text-muted-foreground text-xs">
												{t("Offers: {list}", {
													list: state.data.playbook.offers.join(" · "),
												})}
											</p>
										) : null}
										{state.data.playbook.prices.length > 0 ? (
											<p className="text-muted-foreground text-xs">
												{t(
													"Price orientation, averages that change over time, never a rule: {list}",
													{ list: state.data.playbook.prices.join(" · ") },
												)}
											</p>
										) : null}
										{state.data.playbook.conditions.length > 0 ? (
											<p className="text-muted-foreground text-xs">
												{t("Conditions: {list}", {
													list: state.data.playbook.conditions.join(" · "),
												})}
											</p>
										) : null}
										{state.data.playbook.declines.length > 0 ? (
											<p className="text-muted-foreground text-xs">
												{t("Declines: {list}", {
													list: state.data.playbook.declines.join(" · "),
												})}
											</p>
										) : null}
									</CollapsibleContent>
								</Collapsible>
							</div>
						) : null}

						{mode === "auto" ? (
							<div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
								<p className="text-muted-foreground text-xs">
									{state.data?.tuning
										? t(
												"The agent is reading your verdicts and tuning the weighting now.",
											)
										: state.data?.tunedAt
											? `${t("Last tuned by the agent")} `
											: t(
													"Not tuned yet. Mark a few people as worth it or not for us, then the agent learns from that.",
												)}
									{!state.data?.tuning && state.data?.tunedAt ? (
										<LocalRelativeTime date={state.data.tunedAt} />
									) : null}
									{state.data
										? ` · ${t("{count} verdicts so far", { count: state.data.verdicts })}`
										: ""}
								</p>
								{state.data?.note ? <p>{state.data.note}</p> : null}
								<div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={
											!canManage || tune.isPending || state.data?.tuning
										}
										onClick={() => tune.mutate()}
									>
										{tune.isPending || state.data?.tuning ? <Spinner /> : null}
										{t("Tune now")}
									</Button>
								</div>
							</div>
						) : null}
					</div>

					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={`${id}-business`}>
								{t("Your business")}
							</FieldLabel>
							<BusinessTextarea
								id={`${id}-business`}
								rows={3}
								value={draft.business.description}
								onChange={(event) =>
									setBusiness("description", event.target.value)
								}
							/>
							<FieldDescription>
								{t(
									"The agent reads every conversation against this sentence to decide whether it is about your business at all.",
								)}
							</FieldDescription>
						</Field>

						<div className="grid grid-cols-2 gap-4">
							<Field>
								<FieldLabel htmlFor={`${id}-products`}>
									{t("Products")}
								</FieldLabel>
								<BusinessTextarea
									id={`${id}-products`}
									rows={4}
									value={products}
									onChange={(event) => setProducts(event.target.value)}
								/>
								<FieldDescription>{t("One per line.")}</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor={`${id}-side-products`}>
									{t("Side ware")}
								</FieldLabel>
								<BusinessTextarea
									id={`${id}-side-products`}
									rows={4}
									value={sideProducts}
									onChange={(event) => setSideProducts(event.target.value)}
								/>
								<FieldDescription>
									{t("Ware you still take, but rank lower. One per line.")}
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor={`${id}-min-pallets`}>
									{t("Minimum quantity in {unit}", {
										unit: unitLabel(draft.business.unit, t),
									})}
								</FieldLabel>
								<Input
									id={`${id}-min-pallets`}
									inputMode="numeric"
									value={draft.business.minPallets}
									onChange={(event) =>
										setBusiness(
											"minPallets",
											Math.max(0, Number(event.target.value) || 0),
										)
									}
								/>
								<FieldDescription>
									{t("How many {unit} per order count as serious.", {
										unit: unitLabel(draft.business.unit, t),
									})}
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor={`${id}-unit`}>
									{t("Counted in")}
								</FieldLabel>
								<Input
									id={`${id}-unit`}
									value={draft.business.unit}
									onChange={(event) => setBusiness("unit", event.target.value)}
									onBlur={() => {
										if (!draft.business.unit.trim())
											setBusiness("unit", DEFAULT_WIN_BACK_RULES.business.unit);
									}}
								/>
								<FieldDescription>
									{t(
										"What the minimum quantity counts, for example units or projects.",
									)}
								</FieldDescription>
							</Field>
						</div>

						<Field hidden={mode === "auto"}>
							<div className="flex items-center justify-between gap-6">
								<FieldLabel htmlFor={`${id}-topic`}>
									{t("Only people whose conversations are about your business")}
								</FieldLabel>
								<Switch
									id={`${id}-topic`}
									checked={draft.include.requireTopic}
									onCheckedChange={(value) => setInclude("requireTopic", value)}
								/>
							</div>
							<FieldDescription>
								{t(
									"Off, and people whose conversations have not been read yet show up too.",
								)}
							</FieldDescription>
						</Field>

						<Field hidden={mode === "auto"}>
							<div className="flex items-center justify-between gap-6">
								<FieldLabel htmlFor={`${id}-never`}>
									{t("Include people you never replied to")}
								</FieldLabel>
								<Switch
									id={`${id}-never`}
									checked={draft.include.neverReplied}
									onCheckedChange={(value) => setInclude("neverReplied", value)}
								/>
							</div>
							<FieldDescription>
								{t(
									"Off, and only people you have written to at least once appear.",
								)}
							</FieldDescription>
						</Field>

						<Field hidden={mode === "auto"}>
							<div className="flex items-center justify-between gap-6">
								<FieldLabel htmlFor={`${id}-company`}>
									{t("Only people with a company")}
								</FieldLabel>
								<Switch
									id={`${id}-company`}
									checked={draft.include.requireCompany}
									onCheckedChange={(value) =>
										setInclude("requireCompany", value)
									}
								/>
							</div>
						</Field>

						<Field hidden={mode === "auto"}>
							<div className="flex items-center justify-between gap-6">
								<FieldLabel htmlFor={`${id}-deal`}>
									{t("Only people on an open or won deal")}
								</FieldLabel>
								<Switch
									id={`${id}-deal`}
									checked={draft.include.requireDeal}
									onCheckedChange={(value) => setInclude("requireDeal", value)}
								/>
							</div>
						</Field>

						<Field hidden={mode === "auto"}>
							<div className="flex items-center justify-between gap-6">
								<FieldLabel htmlFor={`${id}-meeting`}>
									{t("Only people you met")}
								</FieldLabel>
								<Switch
									id={`${id}-meeting`}
									checked={draft.include.requireMeeting}
									onCheckedChange={(value) =>
										setInclude("requireMeeting", value)
									}
								/>
							</div>
						</Field>

						<div className="grid grid-cols-2 gap-4" hidden={mode === "auto"}>
							<Field>
								<FieldLabel htmlFor={`${id}-min`}>
									{t("Minimum emails")}
								</FieldLabel>
								<Input
									id={`${id}-min`}
									inputMode="numeric"
									value={draft.include.minEmails}
									onChange={(event) =>
										setInclude(
											"minEmails",
											Math.max(1, Number(event.target.value) || 1),
										)
									}
								/>
								<FieldDescription>
									{t("Both directions together.")}
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor={`${id}-min-them`}>
									{t("Minimum from them")}
								</FieldLabel>
								<Input
									id={`${id}-min-them`}
									inputMode="numeric"
									value={draft.include.minFromThem}
									onChange={(event) =>
										setInclude(
											"minFromThem",
											Math.max(0, Number(event.target.value) || 0),
										)
									}
								/>
							</Field>
						</div>

						{mode === "auto" ? (
							<p className="text-muted-foreground text-xs">
								{t(
									"Filters and weighting are set by the agent in this mode. Your business description, products, minimum quantity, keywords and blocked domains stay yours.",
								)}
							</p>
						) : null}

						<div className="flex flex-col gap-1 pt-2" hidden={mode === "auto"}>
							<p className="font-medium text-sm">{t("Weighting")}</p>
							<p className="text-muted-foreground text-xs">
								{t("More weight sorts higher. Zero switches a fact off.")}
							</p>
						</div>

						{POINT_FIELDS.map((field) => (
							<Field key={field.key} hidden={mode === "auto"}>
								<div className="flex items-center justify-between gap-6">
									<FieldLabel
										htmlFor={`${id}-${field.key}`}
										className="flex flex-col items-start gap-0.5"
									>
										<span>{t(field.label)}</span>
										{field.hint ? (
											<span className="font-normal text-muted-foreground text-xs">
												{t(field.hint)}
											</span>
										) : null}
									</FieldLabel>
									<Input
										id={`${id}-${field.key}`}
										inputMode="numeric"
										className="w-20 text-right"
										value={draft.points[field.key]}
										onChange={(event) =>
											setPoints(
												field.key,
												Math.max(0, Number(event.target.value) || 0),
											)
										}
									/>
								</div>
							</Field>
						))}

						<Field>
							<FieldLabel htmlFor={`${id}-keywords`}>
								{t("Job title keywords")}
							</FieldLabel>
							<Textarea
								id={`${id}-keywords`}
								rows={4}
								value={keywords}
								onChange={(event) => setKeywords(event.target.value)}
								placeholder={"Geschäftsführer\nEinkauf\nCEO"}
							/>
							<FieldDescription>
								{t(
									"One per line. Matched anywhere in the title, ignoring case.",
								)}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={`${id}-domains`}>
								{t("Never list these domains")}
							</FieldLabel>
							<Textarea
								id={`${id}-domains`}
								rows={3}
								value={domains}
								onChange={(event) => setDomains(event.target.value)}
								placeholder={"example.com\nsupplier.de"}
							/>
							<FieldDescription>
								{t("One per line. Suppliers, banks, your own other addresses.")}
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form={FORM}
						disabled={!canManage || save.isPending}
					>
						{save.isPending ? <Spinner /> : null}
						{mode === "auto" ? t("Save business facts") : t("Save rules")}
					</Button>
					<SheetClose asChild>
						<Button variant="outline">{t("Cancel")}</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
