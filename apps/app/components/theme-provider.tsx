"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type * as React from "react";
import { useLayoutEffect } from "react";
import { themeForSegments } from "@/lib/theme-config";

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
			{children}
		</NextThemesProvider>
	);
}
