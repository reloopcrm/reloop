"use client";

import { useQueryState } from "nuqs";
import { PageShellDescription, PageShellTitle } from "@/components/page-shell";
import { useT } from "@/lib/i18n/client";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { overviewParsers } from "./overview-search-params";

function useWelcomeBack(firstName: string | undefined) {
	const t = useT();
	return firstName
		? t("Welcome back, {name}", { name: firstName })
		: t("Welcome back");
}

export function OverviewGreetingFallback({
	connected,
	firstName,
}: {
	connected: boolean;
	firstName?: string;
}) {
	const t = useT();
	const title = useWelcomeBack(firstName);

	if (!connected) return <FirstVisit />;

	return (
		<>
			<PageShellTitle>{title}</PageShellTitle>
			<PageShellDescription>
				{t(
					"What you have closed, what is still in play, and what needs you today.",
				)}
			</PageShellDescription>
		</>
	);
}

export function OverviewGreeting({
	connected,
	firstName,
}: {
	connected: boolean;
	firstName?: string;
}) {
	const t = useT();
	const title = useWelcomeBack(firstName);
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	if (!connected) return <FirstVisit />;

	return (
		<>
			<PageShellTitle>{title}</PageShellTitle>
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
