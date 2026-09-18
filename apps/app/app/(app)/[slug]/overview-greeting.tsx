"use client";

import { useQueryState } from "nuqs";
import { PageShellDescription, PageShellTitle } from "@/components/page-shell";
import { useT } from "@/lib/i18n/client";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { overviewParsers } from "./overview-search-params";

export function OverviewGreetingFallback({
	connected,
}: {
	connected: boolean;
}) {
	const t = useT();

	if (!connected) return <FirstVisit />;

	return (
		<>
			<PageShellTitle>{t("Welcome back")}</PageShellTitle>
			<PageShellDescription>
				{t(
					"What you have closed, what is still in play, and what needs you today.",
				)}
			</PageShellDescription>
		</>
	);
}

export function OverviewGreeting({ connected }: { connected: boolean }) {
	const t = useT();
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	if (!connected) return <FirstVisit />;

	return (
		<>
			<PageShellTitle>{t("Welcome back")}</PageShellTitle>
			<PageShellDescription>
				{scope === "me"
					? t(
							"What you have closed, what is still in play, and what needs you today.",
						)
					: t(
							"What the team has closed, what is still in play, and what needs you today.",
						)}
			</PageShellDescription>
		</>
	);
}

function FirstVisit() {
	const t = useT();

	return (
		<>
			<PageShellTitle>{t("Welcome")}</PageShellTitle>
			<PageShellDescription>
				{t(
					"This page shows what you have closed, what is still in play, and what needs you today. It needs your email first.",
				)}
			</PageShellDescription>
		</>
	);
}
