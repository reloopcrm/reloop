"use client";

import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useSelectedLayoutSegments } from "next/navigation";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type * as React from "react";
import { useLayoutEffect } from "react";
import { THEME, themeForSegments } from "@/lib/theme-config";

const THEME_CLASSES = ["light", "dark"] as const;

function PaintedTheme() {
	const { resolvedTheme } = useTheme();

	useLayoutEffect(() => {
		if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
		const root = document.documentElement;
		root.classList.remove(...THEME_CLASSES);
		root.classList.add(resolvedTheme);
		root.style.colorScheme = resolvedTheme;
	}, [resolvedTheme]);

	return null;
}

function ForgetSiteChoice() {
	useMountEffect(() => {
		try {
			for (const key of THEME.retiredSiteKeys) localStorage.removeItem(key);
		} catch {
			return;
		}
	});

	return null;
}

export function ThemeProvider({
	children,
	...props
}: React.ComponentProps<typeof NextThemesProvider>) {
	const scope = themeForSegments(useSelectedLayoutSegments());

	return (
		<NextThemesProvider
			key={scope.storageKey}
			attribute="class"
			defaultTheme={scope.defaultTheme}
			storageKey={scope.storageKey}
			enableSystem
			disableTransitionOnChange
			{...props}
		>
			<PaintedTheme />
			{scope === THEME.site ? <ForgetSiteChoice /> : null}
			{children}
		</NextThemesProvider>
	);
}
