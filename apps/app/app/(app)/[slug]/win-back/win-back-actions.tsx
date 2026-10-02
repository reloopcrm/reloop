"use client";

import { Button } from "@crm/ui/components/button";
import { MailIcon } from "@crm/ui/components/line-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { WinBackRulesSheet } from "./win-back-rules-sheet";
import {
	winBackInput,
	winBackScopeParsers,
	winBackTable,
} from "./win-back-search-params";

export function WinBackActions() {
	const t = useT();
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const table = useTableQuery(winBackTable);
	const [scope] = useQueryStates(winBackScopeParsers);
	const rules = useQuery(trpc.reactivation.rules.queryOptions());
	const list = useQuery({
		...trpc.reactivation.list.queryOptions(winBackInput(table.input, scope)),
		enabled: false,
		placeholderData: (previous) => previous,
	});
	const next = list.data?.rows
		.flatMap((row) => row.people)
		.find((person) => person.feedback === null && Boolean(person.email));

	return (
		<>
			{rules.data ? <WinBackRulesSheet rules={rules.data} /> : null}
			{next ? (
				<Button
					onClick={() => router.push(workspaceUrl(`/win-back/${next.id}`))}
				>
					<MailIcon data-icon="inline-start" />
					{t("Write to the next one")}
				</Button>
			) : null}
		</>
	);
}
