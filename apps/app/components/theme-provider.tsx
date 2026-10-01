"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";
import { themeForSegment } from "@/lib/theme-config";

export function ThemeProvider({
	children,
	...props
}: React.ComponentProps<typeof NextThemesProvider>) {
	const segment = useSelectedLayoutSegment();

	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme={themeForSegment(segment)}
			enableSystem
			disableTransitionOnChange
			{...props}
		>
			{children}
		</NextThemesProvider>
	);
}
