"use client";

import { UiI18nProvider } from "@crm/ui/lib/i18n";
import { createContext, useContext, useMemo } from "react";
import { de } from "./de";
import { translateError } from "./errors";
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE,
	type Locale,
	type Translate,
	translator,
} from "./locale";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({
	locale,
	children,
}: {
	locale: Locale;
	children: React.ReactNode;
}) {
	return (
		<LocaleContext.Provider value={locale}>
			<UiI18nProvider locale={locale}>{children}</UiI18nProvider>
		</LocaleContext.Provider>
	);
}

export function useLocale(): Locale {
	return useContext(LocaleContext);
}

export function useT(): Translate {
	const locale = useLocale();
	return useMemo(() => translator(locale, de), [locale]);
}

export function writeLocaleCookie(locale: Locale): void {
	const year = 60 * 60 * 24 * 365;
	document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${year}; samesite=lax`;
}

export function useErrorMessage(): (message: string) => string {
	const t = useT();
	const locale = useLocale();
	return (message) => translateError(t, locale, message);
}
