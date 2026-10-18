"use client";

import Add from "@carbon/icons-react/es/Add";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import Renew from "@carbon/icons-react/es/Renew";
import Warning from "@carbon/icons-react/es/Warning";
import { canManageFields } from "@crm/auth/roles";
import {
	FIELD_LIMITS,
	fieldKeyFromLabel,
	typeLabel,
} from "@crm/db/fields-shape";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Loader } from "@crm/ui/components/loader";
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import { Suggestion } from "@crm/ui/components/suggestion";
import { FIELD_TEMPLATES } from "@crm/validation/field-templates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import {
	ADD,
	ARCHIVED_NOTE,
	ARCHIVED_ROW,
	CAP_NOTE,
	CUSTOM_GROUP,
	DRAG_NOTE,
	EMPTY_BODY,
	EMPTY_TITLE,
	ERROR_BODY,
	ERROR_TITLE,
	FILTER_NOTE,
	MANUAL_ONLY,
	NEW_FIELD,
	ORDER_NOTE,
	PROPOSED_ACCEPTED,
	PROPOSED_DISMISSED,
	PROPOSED_GROUP,
	RETRY,
	STANDARD_NOTE,
	STANDARD_ROW,
	SUGGESTED_NOTE,
	SUGGESTED_ROW,
	TABLE_NOTE,
} from "./fields-copy";
import { type FieldEntity, kindOf } from "./fields-entity";
import { STANDARD_FIELDS } from "./standard-fields";

type Field = RouterOutputs["fields"]["list"][number];

const ROW = "flex items-center gap-2.5 border-b px-5 py-2";

function summaryOf(field: Field, t: Translate): string {
	const parts: string[] = [];

	if (field.agentFilled) {
		parts.push(
			field.agentBrief ??
				(field.options.length > 0
					? t("{count} options", { count: field.options.length })
					: field.label),
		);
	} else {
		parts.push(t(MANUAL_ONLY));
		if (field.required) parts.push(t("required"));
	}

	if (field.showOnTable) parts.push(t(TABLE_NOTE));
	if (field.showOnFilter) parts.push(t(FILTER_NOTE));

	return parts.join(" · ");
}

function reordered(fields: Field[], ids: string[]): Field[] {
	const live = fields.filter((field) => !field.archived);
	const byId = new Map(live.map((field) => [field.id, field]));
	const queue = ids
		.map((id) => byId.get(id))
		.filter((field): field is Field => field !== undefined);

	if (queue.length !== live.length) return fields;

	return fields.map((field) =>
		field.archived ? field : (queue.shift() ?? field),
	);
}

function DisclosureRow({
	title,
	note,
	children,
}: {
	title: string;
	note: string;
	children: React.ReactNode;
}) {
	return (
		<Collapsible>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center gap-2 border-b px-5 py-2.5 text-left"
				>
					<Icon
						icon={ChevronRight}
						className="shrink-0 text-muted-foreground"
					/>
					<span className="flex-1 font-medium text-foreground text-xs">
						{title}
					</span>
					<span className="shrink-0 text-muted-foreground text-xs">{note}</span>
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent>{children}</CollapsibleContent>
		</Collapsible>
	);
}

export function FieldsList({
	entity,
	onEdit,
	onNew,
}: {
	entity: FieldEntity;
	onEdit: (key: string) => void;
	onNew: () => void;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const queryClient = useQueryClient();

	const listKey = trpc.fields.list.queryKey({ entity, includeArchived: true });

	const query = useQuery(
		trpc.fields.list.queryOptions({ entity, includeArchived: true }),
	);

	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const canManage = canManageFields(workspace.data?.viewerRole ?? null);

	const reorder = useMutation(
		trpc.fields.reorder.mutationOptions({
			onMutate: async ({ ids }) => {
				await queryClient.cancelQueries({ queryKey: listKey });
				const previous = queryClient.getQueryData(listKey);
				if (previous) {
					queryClient.setQueryData(listKey, reordered(previous, ids));
				}
				return { previous };
			},
			onError: (error, _input, context) => {
				if (context?.previous) {
					queryClient.setQueryData(listKey, context.previous);
				}
				toast.error(errorMessage(error.message));
			},
			onSettled: () => cache.fields(kindOf(entity)),
		}),
	);

	const archive = useMutation(
		trpc.fields.archive.mutationOptions({
			onSuccess: () => cache.fields(kindOf(entity)),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const restore = useMutation(
		trpc.fields.restore.mutationOptions({
			onSuccess: () => cache.fields(kindOf(entity)),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const proposals = useQuery(trpc.fields.proposals.queryOptions({ entity }));

	const decide = useMutation(
		trpc.fields.decideProposal.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.accepted ? t(PROPOSED_ACCEPTED) : t(PROPOSED_DISMISSED),
				);
				return cache.fields(kindOf(entity));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const addSuggested = useMutation(
		trpc.fields.create.mutationOptions({
			onSuccess: () => cache.fields(kindOf(entity)),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const all = query.data ?? [];
	const live = all.filter((field) => !field.archived);
	const proposed = proposals.data ?? [];
	const full = live.length >= FIELD_LIMITS.perEntity;
	const archived = all.filter((field) => field.archived);
	const standard = STANDARD_FIELDS[entity];

	const existingKeys = new Set(all.map((field) => field.key));
	const suggestions = FIELD_TEMPLATES[entity].filter(
		(template) => !existingKeys.has(fieldKeyFromLabel(template.label)),
	);

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<DisclosureRow
					title={t(STANDARD_ROW)}
					note={`${standard.length} · ${t(STANDARD_NOTE)}`}
				>
					<ul className="border-b bg-muted/40 py-1">
						{standard.map((field) => (
							<li
								key={field}
								className="px-5 py-1 text-muted-foreground text-xs"
							>
								{field}
							</li>
						))}
					</ul>
				</DisclosureRow>

				{canManage && proposed.length > 0 ? (
					<div className="border-b px-5 py-2">
						<p className="pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
							{t(PROPOSED_GROUP)}
						</p>
						{proposed.map((proposal) => (
							<Suggestion
								key={proposal.id}
								value={`${proposal.label} · ${t(typeLabel(proposal.type))}`}
								rationale={proposal.reason}
								instruction={proposal.agentBrief}
								pending={decide.isPending}
								onAccept={() =>
									decide.mutate({ id: proposal.id, decision: "accept" })
								}
								onDismiss={() =>
									decide.mutate({ id: proposal.id, decision: "dismiss" })
								}
							/>
						))}
					</div>
				) : null}

				{canManage && suggestions.length > 0 && (
					<DisclosureRow
						title={t(SUGGESTED_ROW)}
						note={`${suggestions.length} · ${t(SUGGESTED_NOTE)}`}
					>
						<ul className="border-b bg-muted/40 py-1">
							{suggestions.map((template) => (
								<li
									key={template.label}
									className="flex items-center gap-2.5 px-5 py-1.5"
								>
									<span className="flex-1 truncate text-muted-foreground text-xs">
										{template.label}
										{template.options && template.options.length > 0
											? ` · ${template.options.join(", ")}`
											: ` · ${t(typeLabel(template.type))}`}
									</span>
									<Button
										variant="outline"
										size="xs"
										disabled={addSuggested.isPending || full}
										onClick={() =>
											addSuggested.mutate({
												entity,
												label: template.label,
												type: template.type,
												options: (template.options ?? []).map((label) => ({
													label,
												})),
												agentFilled:
													template.type !== "USER" &&
													template.type !== "NUMBER",
												required: false,
												showOnSheet: true,
												showOnTable: false,
												showOnFilter: false,
											})
										}
									>
										<Icon icon={Add} data-icon="inline-start" />
										{t(ADD)}
									</Button>
								</li>
							))}
						</ul>
					</DisclosureRow>
				)}

				{query.isPending ? (
					<div className="flex flex-1 items-center justify-center">
						<Loader />
					</div>
				) : query.isError ? (
					<Empty className="flex-1">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Icon icon={Warning} />
							</EmptyMedia>
							<EmptyTitle>{t(ERROR_TITLE)}</EmptyTitle>
							<EmptyDescription>{t(ERROR_BODY)}</EmptyDescription>
						</EmptyHeader>
						{canManage ? (
							<EmptyContent>
								<Button
									variant="outline"
									disabled={query.isFetching}
									onClick={() => query.refetch()}
								>
									<Icon icon={Renew} data-icon="inline-start" />
									{t(RETRY)}
								</Button>
							</EmptyContent>
						) : null}
					</Empty>
				) : (
					<>
						{live.length === 0 ? (
							<Empty className="flex-1">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Icon icon={Add} />
									</EmptyMedia>
									<EmptyTitle>{t(EMPTY_TITLE)}</EmptyTitle>
									<EmptyDescription>{t(EMPTY_BODY)}</EmptyDescription>
								</EmptyHeader>
								<EmptyContent>
									<Button onClick={onNew} disabled={full}>
										<Icon icon={Add} data-icon="inline-start" />
										{t(NEW_FIELD)}
									</Button>
								</EmptyContent>
							</Empty>
						) : (
							<>
								<div className="flex items-center justify-between gap-3 px-5 pt-3.5 pb-2">
									<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										{t(CUSTOM_GROUP)}
									</span>
									<span className="text-muted-foreground text-xs">
										{full ? t(CAP_NOTE) : t(DRAG_NOTE)}
									</span>
								</div>

								<SortableList
									ids={live.map((field) => field.id)}
									onReorder={(ids) => reorder.mutate({ entity, ids })}
								>
									{live.map((field) => (
										<SortableItem
											key={field.id}
											id={field.id}
											label={field.label}
											className={ROW}
										>
											<button
												type="button"
												onClick={() => onEdit(field.key)}
												className="flex min-w-0 flex-1 flex-col gap-px text-left"
											>
												<span className="w-full truncate font-medium text-foreground text-xs">
													{field.label}
												</span>
												<span className="w-full truncate text-muted-foreground text-xs">
													{summaryOf(field, t)}
												</span>
											</button>

											<Badge
												variant="mono"
												className="w-18 shrink-0 justify-center"
											>
												{t(field.typeLabel)}
											</Badge>

											{canManage ? (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="icon-xs">
															<Icon icon={OverflowMenuVertical} />
															<span className="sr-only">
																{t("More for {label}", { label: field.label })}
															</span>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onSelect={() => onEdit(field.key)}
														>
															{t("Edit")}
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onSelect={() => archive.mutate({ id: field.id })}
														>
															{t("Archive")}
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											) : null}
										</SortableItem>
									))}
								</SortableList>
							</>
						)}

						{archived.length > 0 ? (
							<DisclosureRow
								title={t(ARCHIVED_ROW)}
								note={`${archived.length} · ${t(ARCHIVED_NOTE)}`}
							>
								<ul className="border-b">
									{archived.map((field) => (
										<li
											key={field.id}
											className="flex items-center gap-2.5 px-5 py-2"
										>
											<span className="flex-1 truncate text-muted-foreground text-xs">
												{field.label}
											</span>
											{canManage ? (
												<Button
													variant="outline"
													size="xs"
													onClick={() => restore.mutate({ id: field.id })}
												>
													{t("Restore")}
												</Button>
											) : null}
										</li>
									))}
								</ul>
							</DisclosureRow>
						) : null}
					</>
				)}
			</div>

			{canManage && live.length > 0 ? (
				<div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">
					<Button onClick={onNew} disabled={full}>
						<Icon icon={Add} data-icon="inline-start" />
						{t(NEW_FIELD)}
					</Button>
					<span className="text-right text-muted-foreground text-xs">
						{t(ORDER_NOTE)}
					</span>
				</div>
			) : null}
		</>
	);
}
