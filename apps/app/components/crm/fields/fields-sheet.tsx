"use client";

import { Loader } from "@crm/ui/components/loader";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import {
	type RecordKind,
	useFieldsSheet,
} from "@/components/crm/record-sheet/record-stack";
import { DetailSheet, DetailSheetHeader } from "@/components/detail-sheet";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { FieldEditor } from "./field-editor";
import {
	ENTITY_TABS,
	NEW_FIELD,
	SHEET_TITLE,
	subtitleFor,
} from "./fields-copy";
import { entityOf } from "./fields-entity";
import { FieldsList } from "./fields-list";

function FieldsSheetBody({
	kind,
	field,
	onEntity,
	onEdit,
	onClose,
}: {
	kind: RecordKind;
	field: string | null;
	onEntity: (kind: RecordKind) => void;
	onEdit: (key: string | null) => void;
	onClose: () => void;
}) {
	const t = useT();
	const trpc = useTRPC();
	const entity = entityOf(kind);

	const query = useQuery(
		trpc.fields.list.queryOptions({ entity, includeArchived: true }),
	);

	const editingKey = field && field !== "new" ? field : null;
	const editing = editingKey
		? query.data?.find((entry) => entry.key === editingKey)
		: undefined;

	const coverage = useQuery({
		...trpc.fields.coverage.queryOptions({ id: editing?.id ?? "" }),
		enabled: Boolean(editing?.agentFilled),
	});

	if (field) {
		const entityTab = ENTITY_TABS.find((tab) => tab.kind === kind);
		const entityLabel = entityTab ? t(entityTab.label) : undefined;
		const filled = coverage.data;

		return (
			<>
				<DetailSheetHeader
					title={editing?.label ?? (editingKey ? "" : t(NEW_FIELD))}
					description={
						filled
							? t("{entity} · {filled} of {total} filled", {
									entity: entityLabel ?? "",
									filled: filled.filled,
									total: filled.total,
								})
							: entityLabel
					}
					onBack={() => onEdit(null)}
					onClose={onClose}
				/>
				{editingKey && query.isPending ? (
					<div className="flex min-h-0 flex-1 items-center justify-center">
						<Loader />
					</div>
				) : (
					<FieldEditor
						key={editing?.id ?? "new"}
						entity={entity}
						field={editing}
						onDone={() => onEdit(null)}
					/>
				)}
			</>
		);
	}

	return (
		<>
			<DetailSheetHeader
				title={t(SHEET_TITLE)}
				description={t(subtitleFor(kind))}
				onClose={onClose}
				note={
					<Tabs
						value={kind}
						onValueChange={(next) => onEntity(next as RecordKind)}
					>
						<TabsList>
							{ENTITY_TABS.map((tab) => (
								<TabsTrigger key={tab.kind} value={tab.kind}>
									{t(tab.label)}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				}
			/>
			<FieldsList
				entity={entity}
				onEdit={(key) => onEdit(key)}
				onNew={() => onEdit("new")}
			/>
		</>
	);
}

export function FieldsSheetHost() {
	const { entity, field, open, close, edit } = useFieldsSheet();

	return (
		<DetailSheet
			open={entity !== null}
			size="md"
			onOpenChange={(next) => {
				if (!next) close();
			}}
		>
			{entity ? (
				<FieldsSheetBody
					kind={entity}
					field={field}
					onEntity={open}
					onEdit={edit}
					onClose={close}
				/>
			) : null}
		</DetailSheet>
	);
}
