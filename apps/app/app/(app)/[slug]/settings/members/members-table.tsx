"use client";

import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import {
	canAssignRole,
	canRemoveMember,
	type WorkspaceRole,
} from "@crm/auth/roles";
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
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { membersSearchParams } from "./members-search-params";

export const ROLE_LABEL = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
} as const;

export type Role = keyof typeof ROLE_LABEL;

type MemberRow = RouterOutputs["workspace"]["members"]["rows"][number];

export function assignableRoles(
	viewerRole: WorkspaceRole | null,
	current: Role,
): Role[] {
	return (Object.keys(ROLE_LABEL) as Role[]).filter((role) =>
		canAssignRole(viewerRole, current, role),
	);
}

function columns(
	t: Translate,
	viewerRole: WorkspaceRole | null,
	onChangeRole: (member: MemberRow, role: Role) => void,
	onRemove: (member: MemberRow) => void,
	pending: boolean,
): DataTableColumn<MemberRow>[] {
	return [
		{
			id: "name",
			header: t("Name"),
			sortable: true,
			hideable: false,
			cell: (row) => (
				<span className="flex min-w-0 items-center gap-2">
					<PersonAvatar
						size="sm"
						src={row.image}
						name={row.name}
						email={row.email}
					/>
					<span className="truncate font-medium">{row.name}</span>
					{row.isViewer ? (
						<span className="text-muted-foreground text-xs">{t("You")}</span>
					) : null}
				</span>
			),
		},
		{
			id: "email",
			header: t("Email"),
			sortable: true,
			size: 370,
			cell: (row) => (
				<span className="truncate text-muted-foreground">{row.email}</span>
			),
		},
		{
			id: "role",
			header: t("Role"),
			sortable: true,
			size: 160,
			cell: (row) => (
				<span className="text-muted-foreground">{t(ROLE_LABEL[row.role])}</span>
			),
		},
		{
			id: "joinedAt",
			header: t("Joined"),
			label: t("Joined date"),
			sortable: true,
			align: "right",
			size: 160,
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.joinedAt} />
				</span>
			),
		},
		{
			id: "actions",
			header: <span className="sr-only">{t("Actions")}</span>,
			label: t("Actions"),
			hideable: false,
			align: "right",
			control: true,
			cell: (row) => {
				const roles = assignableRoles(viewerRole, row.role);
				const removable =
					!row.isViewer && canRemoveMember(viewerRole, row.role);
				if (roles.length === 0 && !removable) return null;

				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" disabled={pending}>
								<Icon icon={OverflowMenuHorizontal} />
								<span className="sr-only">
									{t("Change {name}'s role", { name: row.name })}
								</span>
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							{roles.map((role) => (
								<DropdownMenuItem
									key={role}
									data-checked={row.role === role}
									onSelect={() => {
										if (row.role === role) return;
										onChangeRole(row, role);
									}}
								>
									{t(ROLE_LABEL[role])}
								</DropdownMenuItem>
							))}
							{removable ? (
								<>
									{roles.length > 0 ? <DropdownMenuSeparator /> : null}
									<DropdownMenuItem onSelect={() => onRemove(row)}>
										{t("Remove from workspace")}
									</DropdownMenuItem>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];
}

export function MembersTable({
	viewerRole,
}: {
	viewerRole: WorkspaceRole | null;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { query, input } = useTableQuery(membersSearchParams);

	const members = useQuery({
		...trpc.workspace.members.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	const setRole = useMutation(
		trpc.workspace.setMemberRole.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				toast.success(t("Role changed."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const [removing, setRemoving] = useState<MemberRow | null>(null);

	const remove = useMutation(
		trpc.workspace.removeMember.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				toast.success(t("Removed from the workspace."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const facetCounts = members.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "role",
			label: t("Role"),
			options: (Object.keys(ROLE_LABEL) as Role[]).flatMap((role) =>
				(facetCounts?.role?.[role] ?? 0) > 0
					? [{ value: role, label: t(ROLE_LABEL[role]) }]
					: [],
			),
		},
	];

	return (
		<>
			<DataTable
				query={query}
				search={<ListSearch placeholder={t("Search by name or email…")} />}
				columns={columns(
					t,
					viewerRole,
					(member, role) => setRole.mutate({ memberId: member.id, role }),
					setRemoving,
					setRole.isPending || remove.isPending,
				)}
				rows={members.data?.rows ?? []}
				total={members.data?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={members.isFetching}
				empty={t("Nobody matches this view.")}
			/>

			<AlertDialog
				open={removing !== null}
				onOpenChange={(open) => {
					if (!open) setRemoving(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("Remove {name} from the workspace?", {
								name: removing?.name ?? "",
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"They are signed out now and cannot sign in again. Their contacts, deals and activities stay.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter>
						<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (removing) remove.mutate({ memberId: removing.id });
							}}
						>
							{t("Remove")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
