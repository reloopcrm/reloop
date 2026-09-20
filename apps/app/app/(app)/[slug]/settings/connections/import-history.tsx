"use client";

import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { LocalDay } from "@/components/local-date-time";
import { useT } from "@/lib/i18n/client";

export const IMPORT_HISTORY = [
	{ value: "all", label: "Everything in the mailbox" },
	{ value: "365", label: "The last 12 months" },
	{ value: "90", label: "The last 90 days" },
	{ value: "0", label: "Only new mail from now on" },
] as const;

export type ImportHistoryValue = (typeof IMPORT_HISTORY)[number]["value"];

export const DEFAULT_IMPORT_HISTORY: ImportHistoryValue = "all";

export const IMPORT_HISTORY_NOTE =
	"A large mailbox takes a few hours in the background.";

const DAY_MS = 86_400_000;

export function importSinceFor(history: ImportHistoryValue): string | null {
	if (history === "all") return null;

	const days = Number(history);
	const since = new Date();
	since.setDate(since.getDate() - days);
	since.setHours(0, 0, 0, 0);

	return since.toISOString();
}

export function historyOf(
	importSince: string | null,
	now = new Date(),
): ImportHistoryValue {
	if (!importSince) return "all";

	const days = (now.getTime() - new Date(importSince).getTime()) / DAY_MS;
	if (days > 200) return "365";
	if (days > 45) return "90";

	return "0";
}

export function ImportHistoryField({
	id,
	value,
	disabled,
	onChange,
}: {
	id: string;
	value: ImportHistoryValue;
	disabled?: boolean;
	onChange: (value: ImportHistoryValue) => void;
}) {
	const t = useT();

	return (
		<Field>
			<FieldLabel htmlFor={id}>{t("Import history")}</FieldLabel>
			<Select
				value={value}
				disabled={disabled}
				onValueChange={(next) => onChange(next as ImportHistoryValue)}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{IMPORT_HISTORY.map((entry) => (
						<SelectItem key={entry.value} value={entry.value}>
							{t(entry.label)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<FieldDescription>{t(IMPORT_HISTORY_NOTE)}</FieldDescription>
		</Field>
	);
}

export function ImportHistoryRow({
	id,
	value,
	disabled,
	onChange,
}: {
	id: string;
	value: ImportHistoryValue;
	disabled?: boolean;
	onChange: (value: ImportHistoryValue) => void;
}) {
	const t = useT();

	return (
		<div className="flex items-center justify-between gap-6">
			<Label htmlFor={id} className="flex flex-col items-start gap-1">
				<span className="text-sm">{t("Import history")}</span>
				<span className="font-normal text-muted-foreground text-xs">
					{t(IMPORT_HISTORY_NOTE)}
				</span>
			</Label>

			<Select
				value={value}
				disabled={disabled}
				onValueChange={(next) => onChange(next as ImportHistoryValue)}
			>
				<SelectTrigger id={id} className="w-60">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{IMPORT_HISTORY.map((entry) => (
						<SelectItem key={entry.value} value={entry.value}>
							{t(entry.label)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function ImportHistoryProgress({ reached }: { reached: string | null }) {
	const t = useT();

	if (!reached) return <>{t("Reading the history, starting now")}</>;

	return (
		<>
			{t("Reading the history, back to")} <LocalDay date={reached} />
		</>
	);
}
