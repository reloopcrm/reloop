"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";
import { themeForSegment } from "@/lib/theme-config";

export function ThemeProvider({
	children,
	...props
}: React.ComponentProps<typeof NextThemesProvider>) {
	const scope = themeForSegment(useSelectedLayoutSegment());

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
			{children}
		</NextThemesProvider>
	);
}
