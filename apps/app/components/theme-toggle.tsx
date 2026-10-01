"use client";

import { Button } from "@crm/ui/components/button";
import { DarkIcon, LightIcon } from "@crm/ui/components/line-icons";
import { useTheme } from "next-themes";
import { useT } from "@/lib/i18n/client";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const t = useT();

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label={t("Switch theme")}
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
			className="shrink-0"
		>
			<LightIcon aria-hidden className="dark:hidden" />
			<DarkIcon aria-hidden className="hidden dark:block" />
		</Button>
	);
}
