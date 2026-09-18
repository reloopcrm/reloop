"use client";

import Add from "@carbon/icons-react/es/Add";
import Close from "@carbon/icons-react/es/Close";
import { canManageFields } from "@crm/auth/roles";
import {
	FIELD_TYPES,
	fieldKeyFromLabel,
	typeLabel,
} from "@crm/db/fields-shape";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldLabel,
	FieldTitle,
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
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import {
	ADD_FIELD,
	ADD_OPTION,
	AGENT_HELP,
	AGENT_LABEL,
	ALL_FILLED,
	ARCHIVE,
	BRIEF_HELP,
	BRIEF_LABEL,
	CANCEL,
	FILL_REST,
	filterPlacement,
	KEY_HELP,
	KEY_LABEL,
	LABEL_LABEL,
	OPTIONS_LABEL,
	SAVE,
	sheetPlacement,
	TYPE_LABEL,
	tablePlacement,
} from "./fields-copy";
import { type FieldEntity, kindOf } from "./fields-entity";

const COVERAGE_NOUN = {
	COMPANY: "companies",
	CONTACT: "contacts",
	DEAL: "deals",
} satisfies Record<FieldEntity, string>;

type FieldRecord = RouterOutputs["fields"]["list"][number];

type Draft = {
	label: string;
	type: (typeof FIELD_TYPES)[number];
	options: { id?: string; label: string }[];
	agentFilled: boolean;
	agentBrief: string;
	showOnSheet: boolean;
	showOnTable: boolean;
	showOnFilter: boolean;
};

const TYPE_HINTS = {
	TEXT: "Text: a short line",
	LONG_TEXT: "Long text: a paragraph",
	NUMBER: "Number",
	DATE: "Date",
	CHECKBOX: "Checkbox: yes or no",
	SELECT: "Select: one of a fixed list",
	URL: "URL",
	EMAIL: "Email",
	PHONE: "Phone",
	USER: "User: someone in the workspace",
} satisfies Record<(typeof FIELD_TYPES)[number], string>;

function optionId(option: { id?: string }, index: number): string {
	return option.id ?? `draft-${index}`;
}

const SECTION = "flex flex-col gap-4 border-b px-5 py-4";

function draftFrom(field: FieldRecord | undefined): Draft {
	return {
		label: field?.label ?? "",
		type: field?.type ?? "TEXT",
		options:
			field?.options.map((option) => ({
				id: option.id,
				label: option.label,
			})) ?? [],
		agentFilled: field?.agentFilled ?? true,
		agentBrief: field?.agentBrief ?? "",
		showOnSheet: field?.showOnSheet ?? true,
		showOnTable: field?.showOnTable ?? false,
		showOnFilter: field?.showOnFilter ?? false,
	};
}

function Coverage({ field }: { field: FieldRecord }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const canManage = canManageFields(workspace.data?.viewerRole ?? null);

	const coverage = useQuery(
		trpc.fields.coverage.queryOptions({ id: field.id }),
	);

	const backfill = useMutation(
		trpc.fields.backfill.mutationOptions({
			onSuccess: async () => {
				toast.success(t("Your agents will pick this up."));
				await cache.fieldCoverage(field.id);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!field.agentFilled || !coverage.data) return null;

	const { filled, total } = coverage.data;
	const noun = COVERAGE_NOUN[field.entity as FieldEntity];
	const covered = filled >= total;

	return (
		<div className="shrink-0 border-t px-5 py-3">
			<div className="flex items-center gap-3 rounded-lg border bg-muted p-3">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<StatusIndicator
						tone="primary"
						className="font-medium text-foreground"
						label={t("Filled on {filled} of {total} {noun}", {
							filled,
							total,
							noun: t(noun),
						})}
					/>
					<span className="pl-4 text-muted-foreground text-xs">
						{covered
							? t(ALL_FILLED)
							: t("{count} still to go", { count: total - filled })}
					</span>
				</div>
				{canManage ? (
					<Button
						variant="outline"
						size="sm"
						disabled={backfill.isPending || covered}
						onClick={() => backfill.mutate({ id: field.id })}
					>
						{t(FILL_REST)}
					</Button>
				) : null}
			</div>
		</div>
	);
}

export function FieldEditor({
	entity,
	field,
	onDone,
}: {
	entity: FieldEntity;
	field: FieldRecord | undefined;
	onDone: () => void;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const canManage = canManageFields(workspace.data?.viewerRole ?? null);
	const labelId = useId();
	const briefId = useId();
	const agentId = useId();
	const typeId = useId();
	const optionsId = useId();

	const [draft, setDraft] = useState<Draft>(() => draftFrom(field));
	const [confirming, setConfirming] = useState(false);

	const patch = (next: Partial<Draft>) =>
		setDraft((current) => ({ ...current, ...next }));

	const settle = async () => {
		await cache.fields(kindOf(entity));
		onDone();
	};

	const create = useMutation(
		trpc.fields.create.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const update = useMutation(
		trpc.fields.update.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const archive = useMutation(
		trpc.fields.archive.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const key = field?.key ?? fieldKeyFromLabel(draft.label);
	const saving = create.isPending || update.isPending;
	const filterable = draft.type === "SELECT" || draft.type === "USER";

	const save = () => {
		const payload = {
			label: draft.label,
			type: draft.type,
			options: draft.options.filter((option) => option.label.trim() !== ""),
			agentFilled: draft.agentFilled,
			agentBrief: draft.agentBrief.trim() || null,
			showOnSheet: draft.showOnSheet,
			showOnTable: draft.showOnTable,
			showOnFilter: filterable && draft.showOnFilter,
		};

		if (field) {
			update.mutate({ id: field.id, data: payload });
			return;
		}

		create.mutate({ ...payload, entity, required: false });
	};

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<div className={SECTION}>
					<Field>
						<FieldLabel htmlFor={labelId}>{t(LABEL_LABEL)}</FieldLabel>
						<Input
							id={labelId}
							value={draft.label}
							onChange={(event) => patch({ label: event.target.value })}
						/>
					</Field>

					<Field>
						<div className="flex items-baseline justify-between gap-2">
							<FieldTitle>{t(KEY_LABEL)}</FieldTitle>
							<span className="font-mono text-muted-foreground text-xs">
								{key || "-"}
							</span>
						</div>
						<FieldDescription>{t(KEY_HELP)}</FieldDescription>
					</Field>
				</div>

				<div className={SECTION}>
					<Field orientation="horizontal">
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<FieldLabel htmlFor={agentId}>{t(AGENT_LABEL)}</FieldLabel>
							<FieldDescription>{t(AGENT_HELP)}</FieldDescription>
						</div>
						<Switch
							id={agentId}
							checked={draft.agentFilled}
							onCheckedChange={(agentFilled) => patch({ agentFilled })}
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor={briefId}>{t(BRIEF_LABEL)}</FieldLabel>
						<Textarea
							id={briefId}
							rows={3}
							value={draft.agentBrief}
							onChange={(event) => patch({ agentBrief: event.target.value })}
						/>
						<FieldDescription>{t(BRIEF_HELP)}</FieldDescription>
					</Field>
				</div>

				<div className={SECTION}>
					<Field>
						<FieldLabel htmlFor={typeId}>{t(TYPE_LABEL)}</FieldLabel>
						<Select
							value={draft.type}
							onValueChange={(value) => patch({ type: value as Draft["type"] })}
						>
							<SelectTrigger id={typeId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{FIELD_TYPES.map((type) => (
									<SelectItem key={type} value={type}>
										{t(TYPE_HINTS[type] ?? typeLabel(type))}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					{draft.type === "SELECT" ? (
						<Field aria-labelledby={optionsId}>
							<FieldTitle id={optionsId}>{t(OPTIONS_LABEL)}</FieldTitle>
							<SortableList
								ids={draft.options.map(optionId)}
								onReorder={(ids) =>
									patch({
										options: ids
											.map((id) =>
												draft.options.find(
													(option, at) => optionId(option, at) === id,
												),
											)
											.filter((option): option is Draft["options"][number] =>
												Boolean(option),
											),
									})
								}
							>
								<div className="flex flex-col gap-1.5">
									{draft.options.map((option, index) => (
										<SortableItem
											key={optionId(option, index)}
											id={optionId(option, index)}
											label={option.label || t("option")}
										>
											<Input
												aria-label={t("Option {number}", {
													number: index + 1,
												})}
												value={option.label}
												onChange={(event) =>
													patch({
														options: draft.options.map((entry, at) =>
															at === index
																? { ...entry, label: event.target.value }
																: entry,
														),
													})
												}
											/>
											<Button
												variant="ghost"
												size="icon-xs"
												onClick={() =>
													patch({
														options: draft.options.filter(
															(_, at) => at !== index,
														),
													})
												}
											>
												<Icon icon={Close} />
												<span className="sr-only">
													{t("Remove option {number}", { number: index + 1 })}
												</span>
											</Button>
										</SortableItem>
									))}
								</div>
							</SortableList>
							<Button
								variant="ghost"
								size="sm"
								className="self-start"
								onClick={() =>
									patch({ options: [...draft.options, { label: "" }] })
								}
							>
								<Icon icon={Add} data-icon="inline-start" />
								{t(ADD_OPTION)}
							</Button>
						</Field>
					) : null}
				</div>

				<div className="flex flex-col gap-2.5 border-b px-5 py-4">
					<FieldLabel className="items-center gap-2 font-normal">
						<Checkbox
							checked={draft.showOnSheet}
							onCheckedChange={(checked) =>
								patch({ showOnSheet: checked === true })
							}
						/>
						{t(sheetPlacement(entity))}
					</FieldLabel>
					<FieldLabel className="items-center gap-2 font-normal">
						<Checkbox
							checked={draft.showOnTable}
							onCheckedChange={(checked) =>
								patch({ showOnTable: checked === true })
							}
						/>
						{t(tablePlacement(entity))}
					</FieldLabel>
					{filterable ? (
						<FieldLabel className="items-center gap-2 font-normal">
							<Checkbox
								checked={draft.showOnFilter}
								onCheckedChange={(checked) =>
									patch({ showOnFilter: checked === true })
								}
							/>
							{t(filterPlacement(entity))}
						</FieldLabel>
					) : null}
				</div>
			</div>

			{field ? <Coverage field={field} /> : null}

			<div className="flex shrink-0 items-center gap-2 border-t px-5 py-3">
				{canManage ? (
					<Button disabled={saving || draft.label.trim() === ""} onClick={save}>
						{field ? t(SAVE) : t(ADD_FIELD)}
					</Button>
				) : null}
				{field && canManage ? (
					<Button variant="outline" onClick={() => setConfirming(true)}>
						{t(ARCHIVE)}
					</Button>
				) : (
					<Button variant="outline" onClick={onDone}>
						{t(CANCEL)}
					</Button>
				)}
			</div>

			{field ? (
				<AlertDialog open={confirming} onOpenChange={setConfirming}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{t("Archive {label}?", { label: field.label })}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{t("Hidden everywhere. Its values are kept.")}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t(CANCEL)}</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => archive.mutate({ id: field.id })}
							>
								{t("Archive field")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			) : null}
		</>
	);
}
