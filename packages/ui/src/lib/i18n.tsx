"use client";

import { DEFAULT_LOCALE, type Locale } from "@crm/db/locale";
import { createContext, useContext, useMemo } from "react";

export type UiLocale = Locale;

export type UiDictionary = Record<string, string>;

export type UiTranslate = (
	text: string,
	vars?: Record<string, string | number>,
) => string;

type UiI18n = { locale: UiLocale; dictionary: UiDictionary };

const UiI18nContext = createContext<UiI18n>({
	locale: DEFAULT_LOCALE,
	dictionary: {},
});

export function UiI18nProvider({
	locale,
	dictionary = {},
	children,
}: {
	locale: UiLocale;
	dictionary?: UiDictionary;
	children: React.ReactNode;
}) {
	const value = useMemo<UiI18n>(
		() => ({ locale, dictionary }),
		[locale, dictionary],
	);

	return (
		<UiI18nContext.Provider value={value}>{children}</UiI18nContext.Provider>
	);
}

export function useUiLocale(): UiLocale {
	return useContext(UiI18nContext).locale;
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
	const { dictionary } = useContext(UiI18nContext);
	return useMemo<UiTranslate>(
		() => (text, vars) => interpolate(dictionary[text] ?? text, vars),
		[dictionary],
	);
}
