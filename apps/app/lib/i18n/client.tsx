"use client";

import { UiI18nProvider } from "@crm/ui/lib/i18n";
import { createContext, useContext, useMemo } from "react";
import { translateError } from "./errors";
import {
	DEFAULT_LOCALE,
	type Dictionary,
	LOCALE_COOKIE,
	LOCALE_COOKIE_MAX_AGE,
	type Locale,
	type Translate,
	translator,
} from "./locale";

type I18n = { locale: Locale; dictionary: Dictionary };

const I18nContext = createContext<I18n>({
	locale: DEFAULT_LOCALE,
	dictionary: {},
});

export function I18nProvider({
	locale,
	dictionary = {},
	children,
}: {
	locale: Locale;
	dictionary?: Dictionary;
	children: React.ReactNode;
}) {
	const value = useMemo<I18n>(
		() => ({ locale, dictionary }),
		[locale, dictionary],
	);

	return (
		<I18nContext.Provider value={value}>
			<UiI18nProvider locale={locale} dictionary={dictionary}>
				{children}
			</UiI18nProvider>
		</I18nContext.Provider>
	);
}

export function useLocale(): Locale {
	return useContext(I18nContext).locale;
}

export function useT(): Translate {
	const { dictionary } = useContext(I18nContext);
	return useMemo(() => translator(dictionary), [dictionary]);
}

export function writeLocaleCookie(locale: Locale): void {
	document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

export function useErrorMessage(): (message: string) => string {
	const t = useT();
	const locale = useLocale();
	return (message) => translateError(t, locale, message);
}
