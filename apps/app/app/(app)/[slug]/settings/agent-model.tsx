"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { IndicatorDot } from "@crm/ui/components/status-indicator";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { LocalComputed } from "@/components/local-date-time";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ChatgptDeviceLogin } from "./chatgpt-device-login";

type CatalogModel = {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
};

const FOLLOW_DEFAULT = "__default__";

function perMillion(rate: number): string {
	const dollars = rate * 1_000_000;
	return `$${dollars.toFixed(2).replace(/\.?0+$/, "")}`;
}

function priceHint(t: Translate, model: CatalogModel): string | null {
	if (!model.pricing) return null;
	return t("{input} in · {output} out per 1M", {
		input: perMillion(model.pricing.input),
		output: perMillion(model.pricing.output),
	});
}

function contextHint(t: Translate, tokens: number): string {
	return tokens >= 1_000_000
		? t("{count}M context", { count: Math.round(tokens / 1_000_000) })
		: t("{count}K context", { count: Math.round(tokens / 1_000) });
}

function byProvider(models: CatalogModel[]): [string, CatalogModel[]][] {
	const groups = new Map<string, CatalogModel[]>();

	for (const model of models) {
		const list = groups.get(model.provider) ?? [];
		list.push(model);
		groups.set(model.provider, list);
	}

	return [...groups];
}

type ProviderId = "gateway" | "chatgpt" | "openai" | "anthropic";

const PROVIDERS: { id: ProviderId; label: string }[] = [
	{ id: "chatgpt", label: "ChatGPT subscription" },
	{ id: "openai", label: "OpenAI API key" },
	{ id: "anthropic", label: "Anthropic API key" },
	{ id: "gateway", label: "Vercel AI Gateway" },
];

const CUSTOM = "__custom__";

type ModelOption = { id: string; label: string; note: string };

function ModelPicker({
	id,
	label,
	value,
	options,
	placeholder,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	options: ModelOption[];
	placeholder: string;
	onChange: (value: string) => void;
}) {
	const t = useT();
	const known = options.some((option) => option.id === value);
	const [custom, setCustom] = useState(!known && value !== "");

	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Select
				value={custom ? CUSTOM : value || placeholder}
				onValueChange={(next) => {
					if (next === CUSTOM) {
						setCustom(true);
						return;
					}
					setCustom(false);
					onChange(next);
				}}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.id} value={option.id}>
							<span>{option.label}</span>
							{option.note ? (
								<span className="ml-2 text-muted-foreground text-xs">
									{t(option.note)}
								</span>
							) : null}
						</SelectItem>
					))}
					<SelectItem value={CUSTOM}>{t("Other model name…")}</SelectItem>
				</SelectContent>
			</Select>
			{custom ? (
				<Input
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
				/>
			) : null}
		</Field>
	);
}

function resetIn(t: Translate, iso: string | null): string {
	if (!iso) return "";
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0) return t("resets now");
	const minutes = Math.round(ms / 60_000);
	if (minutes < 60) return t("resets in {minutes} min", { minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 48) {
		return t("resets in {hours} h {minutes} min", {
			hours,
			minutes: minutes % 60,
		});
	}
	return t("resets in {days} days", { days: Math.round(hours / 24) });
}

function agoLabel(t: Translate, iso: string): string {
	const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return t("just now");
	if (minutes < 60) return t("{minutes} min ago", { minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return t("{hours} h ago", { hours });
	return t("{days} days ago", { days: Math.round(hours / 24) });
}

function windowLabel(t: Translate, minutes: number | null): string {
	if (!minutes) return t("Window");
	if (minutes % 1440 === 0) {
		return t("{days}-day window", { days: minutes / 1440 });
	}
	if (minutes % 60 === 0) {
		return t("{hours}-hour window", { hours: minutes / 60 });
	}
	return t("{minutes}-minute window", { minutes });
}

function UsageBar({
	label,
	percent,
	resetAt,
}: {
	label: string;
	percent: number | null;
	resetAt: string | null;
}) {
	const t = useT();
	const value = Math.min(100, Math.max(0, percent ?? 0));
	return (
		<div className="flex flex-col gap-1">
			<div className="flex justify-between text-xs">
				<span>{label}</span>
				<span className="text-muted-foreground">
					{percent === null ? t("unknown") : t("{percent} % used", { percent })}
					{resetAt ? (
						<>
							{" · "}
							<LocalComputed text={resetIn(t, resetAt)} />
						</>
					) : null}
				</span>
			</div>
			<div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
				<div
					className={
						value >= 100 ? "h-full bg-destructive" : "h-full bg-primary"
					}
					style={{ width: `${value}%` }}
				/>
			</div>
		</div>
	);
}

export function AgentProvider() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const id = useId();

	const [asked, setAsked] = useState<{
		readAt: string;
		probeAt: string;
	} | null>(null);
	const waiting = asked !== null;
	const settings = useQuery({
		...trpc.settings.agentProvider.queryOptions(),
		refetchInterval: waiting ? 3_000 : 30_000,
		refetchIntervalInBackground: waiting,
	});
	const usageReadAt = settings.data?.usage?.updatedAt ?? "";
	const probe = settings.data?.probe ?? null;
	const probeAt = probe?.finishedAt ?? "";
	const probePending = probe?.pending ?? false;

	useEffect(() => {
		if (asked === null) return;

		if (probeAt !== asked.probeAt && !probePending) {
			setAsked(null);
			if (usageReadAt === asked.readAt) {
				toast.error(
					t("OpenAI sent no limit this time. The reading stays as it was."),
				);
			}
			return;
		}

		const giveUp = setTimeout(() => {
			setAsked(null);
			toast.error(t("The agent did not answer in time. Try again."));
		}, 90_000);
		return () => clearTimeout(giveUp);
	}, [asked, probeAt, probePending, usageReadAt, t]);

	const refresh = useMutation(
		trpc.settings.refreshUsage.mutationOptions({
			onSuccess: () => {
				setAsked({ readAt: usageReadAt, probeAt });
				toast.success(
					t("Asking OpenAI for the current limit. Takes a few seconds."),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);
	const [tab, setTab] = useState<ProviderId | null>(null);
	const [chatgptModel, setChatgptModel] = useState<string | null>(null);
	const [openaiModel, setOpenaiModel] = useState<string | null>(null);
	const [anthropicModel, setAnthropicModel] = useState<string | null>(null);
	const [readingModel, setReadingModel] = useState<string | null>(null);
	const [draftModel, setDraftModel] = useState<string | null>(null);
	const [openaiKey, setOpenaiKey] = useState("");
	const [anthropicKey, setAnthropicKey] = useState("");
	const [perHour, setPerHour] = useState<string | null>(null);

	function forget() {
		setChatgptModel(null);
		setOpenaiModel(null);
		setAnthropicModel(null);
		setReadingModel(null);
		setDraftModel(null);
		setOpenaiKey("");
		setAnthropicKey("");
	}

	const save = useMutation(
		trpc.settings.setAgentProvider.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				forget();
				setPerHour(null);
				setTab(null);
				toast.success(t("Saved. The agent uses it from its next model call."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!settings.data) return null;

	const data = settings.data;
	const provider = data.provider;
	const shown = tab ?? provider;
	const models = {
		chatgpt: chatgptModel ?? data.chatgptModel,
		openai: openaiModel ?? data.openaiModel,
		anthropic: anthropicModel ?? data.anthropicModel,
	};
	const reading = readingModel ?? data.readingModel ?? "";
	const drafting = draftModel ?? data.draftModel ?? "";
	const perHourValue =
		perHour ??
		(data.researchPerHour === null ? "" : String(data.researchPerHour));
	const options = (key: ProviderId): ModelOption[] =>
		key === "gateway" ? [] : (data.options[key] ?? []);

	function submit(next: ProviderId) {
		save.mutate({
			provider: next,
			chatgptModel: models.chatgpt,
			openaiModel: models.openai,
			anthropicModel: models.anthropic,
			readingModel: reading || null,
			draftModel: drafting || null,
			openaiKey: openaiKey ? openaiKey : undefined,
			anthropicKey: anthropicKey ? anthropicKey : undefined,
			researchPerHour: perHourValue === "" ? null : Number(perHourValue),
		});
	}

	const configured = {
		chatgpt: true,
		openai: data.openaiKey.configured || openaiKey.length > 0,
		anthropic: data.anthropicKey.configured || anthropicKey.length > 0,
		gateway: data.gatewayConfigured,
	};

	const fallbacks = PROVIDERS.filter(
		(entry) => entry.id !== provider && configured[entry.id],
	).map((entry) => t(entry.label));

	const mailModels = (key: ProviderId) => (
		<>
			<ModelPicker
				id={`${id}-reading`}
				label={t("Model for reading mail")}
				value={reading}
				options={options(key)}
				placeholder={data.defaults.readingModel}
				onChange={setReadingModel}
			/>
			<ModelPicker
				id={`${id}-draft`}
				label={t("Model for email drafts")}
				value={drafting}
				options={options(key)}
				placeholder={data.defaults.draftModel}
				onChange={setDraftModel}
			/>
		</>
	);

	const chatgptPanel = (
		<FieldGroup>
			<ChatgptDeviceLogin
				primary={false}
				onConnected={() => void cache.settings()}
			/>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="font-medium text-sm">{t("ChatGPT usage limit")}</span>
				<span className="flex items-center gap-2 text-muted-foreground text-xs">
					{data.usage ? (
						<span>
							{data.usage.planType ? `${data.usage.planType} · ` : ""}
							<LocalComputed
								text={t("as of {time}", {
									time: agoLabel(t, data.usage.updatedAt),
								})}
							/>
						</span>
					) : (
						t("not read yet")
					)}
					<Button
						type="button"
						variant="ghost"
						size="xs"
						disabled={refresh.isPending || waiting}
						onClick={() => refresh.mutate()}
					>
						{refresh.isPending || waiting ? <Spinner /> : null}
						{t("Refresh")}
					</Button>
				</span>
			</div>

			{data.usage ? (
				<>
					<UsageBar
						label={windowLabel(t, data.usage.primaryWindowMinutes)}
						percent={data.usage.primaryUsedPercent}
						resetAt={data.usage.primaryResetAt}
					/>
					{data.usage.secondaryWindowMinutes ? (
						<UsageBar
							label={windowLabel(t, data.usage.secondaryWindowMinutes)}
							percent={data.usage.secondaryUsedPercent}
							resetAt={data.usage.secondaryResetAt}
						/>
					) : null}
				</>
			) : null}

			{data.probe?.outcome ? (
				<p className="text-muted-foreground text-xs">
					{t("Last check: {outcome}", { outcome: t(data.probe.outcome) })}
				</p>
			) : null}

			<ModelPicker
				id={`${id}-chatgpt`}
				label={t("ChatGPT model for chat and research")}
				value={models.chatgpt}
				options={options("chatgpt")}
				placeholder={data.defaults.chatgptModel}
				onChange={setChatgptModel}
			/>
			<FieldDescription>
				{t("Experimental. OpenAI can withdraw it.")}
			</FieldDescription>

			{mailModels("chatgpt")}
		</FieldGroup>
	);

	const openaiPanel = (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor={`${id}-openai-key`}>
					{t("OpenAI API key")}
				</FieldLabel>
				<Input
					id={`${id}-openai-key`}
					type="password"
					value={openaiKey}
					onChange={(event) => setOpenaiKey(event.target.value)}
					placeholder={
						data.openaiKey.hint ?? t("sk-… from platform.openai.com")
					}
					autoComplete="off"
				/>
			</Field>
			<ModelPicker
				id={`${id}-openai-model`}
				label={t("OpenAI model")}
				value={models.openai}
				options={options("openai")}
				placeholder={data.defaults.openaiModel}
				onChange={setOpenaiModel}
			/>
			{mailModels("openai")}
		</FieldGroup>
	);

	const anthropicPanel = (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor={`${id}-anthropic-key`}>
					{t("Anthropic API key")}
				</FieldLabel>
				<Input
					id={`${id}-anthropic-key`}
					type="password"
					value={anthropicKey}
					onChange={(event) => setAnthropicKey(event.target.value)}
					placeholder={
						data.anthropicKey.hint ?? t("sk-ant-… from console.anthropic.com")
					}
					autoComplete="off"
				/>
			</Field>
			<ModelPicker
				id={`${id}-anthropic-model`}
				label={t("Anthropic model")}
				value={models.anthropic}
				options={options("anthropic")}
				placeholder={data.defaults.anthropicModel}
				onChange={setAnthropicModel}
			/>
			{mailModels("anthropic")}
		</FieldGroup>
	);

	const gatewayPanel = (
		<div className="flex flex-col gap-4">
			{provider === "gateway" ? null : (
				<p className="text-muted-foreground text-xs">
					{data.gatewayConfigured
						? t("Billed to AI_GATEWAY_API_KEY in the root .env file.")
						: t("No AI_GATEWAY_API_KEY in the root .env file yet.")}
				</p>
			)}
			<GatewayModel />
		</div>
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Who pays for the agent")}</CardTitle>
				<CardDescription>
					{t("The account every model call is billed to.")}
				</CardDescription>
			</CardHeader>

			<CardContent>
				<div className="flex flex-col gap-4">
					<ToggleGroup
						type="single"
						wrap
						value={shown}
						onValueChange={(value) => {
							const next = PROVIDERS.find((entry) => entry.id === value);
							if (!next) return;
							forget();
							setTab(next.id);
						}}
					>
						{PROVIDERS.map((entry) => (
							<ToggleGroupItem
								key={entry.id}
								value={entry.id}
								aria-label={
									entry.id === provider
										? `${t(entry.label)}, ${t("Who pays for the agent")}`
										: undefined
								}
							>
								{entry.id === provider ? (
									<IndicatorDot tone="primary" aria-hidden="true" />
								) : null}
								{t(entry.label)}
							</ToggleGroupItem>
						))}
					</ToggleGroup>

					{shown === "chatgpt" ? chatgptPanel : null}
					{shown === "openai" ? openaiPanel : null}
					{shown === "anthropic" ? anthropicPanel : null}
					{shown === "gateway" ? gatewayPanel : null}

					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							submit(shown);
						}}
					>
						<p className="text-muted-foreground text-xs">
							{provider === "gateway"
								? data.gatewayConfigured
									? t("Billed to AI_GATEWAY_API_KEY in the root .env file.")
									: t("No AI_GATEWAY_API_KEY in the root .env file yet.")
								: fallbacks.length > 0
									? t(
											"Falls back to {fallbacks} when this account is at its limit.",
											{ fallbacks: fallbacks.join(", ") },
										)
									: t(
											"No other account is configured, so a usage limit pauses the agent until it resets.",
										)}
						</p>

						<Field orientation="horizontal">
							<FieldLabel htmlFor={`${id}-per-hour`}>
								{t("Research sessions per hour")}
							</FieldLabel>
							<Input
								id={`${id}-per-hour`}
								inputMode="numeric"
								className="w-40"
								value={perHourValue}
								onChange={(event) => setPerHour(event.target.value)}
								placeholder={String(data.defaults.researchPerHour)}
							/>
						</Field>

						<div>
							<Button type="submit" variant="outline" disabled={save.isPending}>
								{save.isPending ? <Spinner /> : null}
								{shown === provider
									? t("Save")
									: t("Bill the agent to this account")}
							</Button>
						</div>
					</form>
				</div>
			</CardContent>
		</Card>
	);
}

function GatewayModel() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [open, setOpen] = useState(false);

	const settings = useQuery(trpc.settings.agentModel.queryOptions());
	const catalog = useQuery(trpc.settings.modelCatalog.queryOptions());

	const save = useMutation(
		trpc.settings.setAgentModel.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				toast.success(
					t("The agent will use this model from its next session."),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!settings.data) return null;

	const { selectedId, effectiveId, defaultId, effective } = settings.data;
	const models = catalog.data?.models ?? [];
	const unavailable = catalog.data !== undefined && !catalog.data.available;

	const defaultModel = models.find((model) => model.id === defaultId);
	const current = selectedId ?? FOLLOW_DEFAULT;

	const effectiveName = effective?.name ?? effectiveId;

	const currentLabel = selectedId
		? effectiveName
		: t("Default: {name}", { name: effectiveName });

	const choose = (id: string) => {
		setOpen(false);
		if (id === current) return;
		save.mutate({ modelId: id === FOLLOW_DEFAULT ? null : id });
	};

	return (
		<div className="flex flex-wrap items-center gap-3">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						aria-label={t("Model")}
						disabled={save.isPending || catalog.isPending || unavailable}
					>
						{currentLabel}
						<Icon icon={ChevronDown} data-icon="inline-end" />
					</Button>
				</PopoverTrigger>

				<PopoverContent align="start" size="fit" className="w-96">
					<Command>
						<CommandInput placeholder={t("Search models…")} />
						<CommandList>
							<CommandEmpty>{t("No model matches that.")}</CommandEmpty>

							<CommandGroup>
								<CommandItem
									value={`default ${defaultId}`}
									data-checked={current === FOLLOW_DEFAULT}
									onSelect={() => choose(FOLLOW_DEFAULT)}
								>
									{t("Default: {name}", {
										name: defaultModel?.name ?? defaultId,
									})}
								</CommandItem>
							</CommandGroup>

							{byProvider(models).map(([provider, group]) => (
								<CommandGroup key={provider} heading={provider}>
									{group.map((model) => {
										const price = priceHint(t, model);

										return (
											<CommandItem
												key={model.id}
												value={`${model.name} ${model.provider} ${model.id}`}
												data-checked={current === model.id}
												onSelect={() => choose(model.id)}
											>
												<span>{model.name}</span>
												<span className="ml-auto text-muted-foreground text-xs">
													{price ?? contextHint(t, model.contextWindowTokens)}
												</span>
											</CommandItem>
										);
									})}
								</CommandGroup>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			<p className="text-muted-foreground text-xs">
				{unavailable
					? t(
							"Could not reach the AI Gateway to list models. The agent is still running {model}.",
							{ model: effectiveId },
						)
					: effective
						? `${effectiveId} · ${contextHint(t, effective.contextWindowTokens)}${
								priceHint(t, effective) ? ` · ${priceHint(t, effective)}` : ""
							}`
						: effectiveId}
			</p>
		</div>
	);
}
