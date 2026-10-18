"use client";

import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useQueryState } from "nuqs";
import { useT } from "@/lib/i18n/client";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import {
	OVERVIEW_SCOPES,
	type OverviewScope,
	overviewParsers,
} from "./overview-search-params";

const LABELS = {
	me: "Me",
	everyone: "Everyone",
} satisfies Record<OverviewScope, string>;

function isScope(value: string): value is OverviewScope {
	return (OVERVIEW_SCOPES as readonly string[]).includes(value);
}

export function OverviewScopeToggleFallback() {
	const t = useT();
	return (
		<ToggleGroup
			type="single"
			size="sm"
			disabled
			aria-label={t("Whose numbers to show")}
		>
			{OVERVIEW_SCOPES.map((value) => (
				<ToggleGroupItem key={value} value={value}>
					{t(LABELS[value])}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

export function OverviewScopeToggle() {
	const t = useT();
	const [scope, setScope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	return (
		<ToggleGroup
			type="single"
			size="sm"
			value={scope}
			onValueChange={(next) => {
				if (isScope(next)) void setScope(next);
			}}
			aria-label={t("Whose numbers to show")}
		>
			{OVERVIEW_SCOPES.map((value) => (
				<ToggleGroupItem key={value} value={value}>
					{t(LABELS[value])}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
