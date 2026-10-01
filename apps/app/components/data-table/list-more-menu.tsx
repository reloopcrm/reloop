"use client";

import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { DownloadIcon, MoreIcon } from "@crm/ui/components/line-icons";
import { useT } from "@/lib/i18n/client";
import {
	type ExportEntity,
	type ExportInput,
	useCsvExport,
} from "./export-button";

export function ListMoreMenu({
	entity,
	input,
	archived,
	onArchivedChange,
}: {
	entity: ExportEntity;
	input: ExportInput;
	archived?: boolean;
	onArchivedChange?: (archived: boolean) => void;
}) {
	const t = useT();
	const exporter = useCsvExport(entity, input);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="icon-sm" aria-label={t("More actions")}>
					<MoreIcon aria-hidden />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-52">
				<DropdownMenuGroup>
					<DropdownMenuItem
						disabled={exporter.pending}
						onSelect={() => void exporter.run()}
					>
						<DownloadIcon aria-hidden />
						{exporter.pending ? t("Preparing…") : t("Export CSV")}
					</DropdownMenuItem>
					{onArchivedChange ? (
						<DropdownMenuCheckboxItem
							checked={archived ?? false}
							onCheckedChange={onArchivedChange}
						>
							{t("Show archived")}
						</DropdownMenuCheckboxItem>
					) : null}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
