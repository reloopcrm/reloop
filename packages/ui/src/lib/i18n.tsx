"use client";

import { createContext, useContext, useMemo } from "react";
import { uiGerman } from "./i18n-de";

export type UiLocale = "de" | "en";

export type UiTranslate = (
	text: string,
	vars?: Record<string, string | number>,
) => string;

const UiLocaleContext = createContext<UiLocale>("en");

export function UiI18nProvider({
	locale,
	children,
}: {
	locale: UiLocale;
	children: React.ReactNode;
}) {
	return (
		<UiLocaleContext.Provider value={locale}>
			{children}
		</UiLocaleContext.Provider>
	);
}

export function useUiLocale(): UiLocale {
	return useContext(UiLocaleContext);
}

function interpolate(
	template: string,
	vars?: Record<string, string | number>,
): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, key: string) =>
		key in vars ? String(vars[key]) : match,
	);
}

export function useUiT(): UiTranslate {
	const locale = useUiLocale();
	return useMemo<UiTranslate>(
		() => (text, vars) =>
			interpolate(locale === "en" ? text : (uiGerman[text] ?? text), vars),
		[locale],
	);
}
