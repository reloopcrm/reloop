"use client";

import Asleep from "@carbon/icons-react/es/Asleep";
import Light from "@carbon/icons-react/es/Light";
import { Button } from "@crm/ui/components/button";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";

const subscribe = () => () => {};

export function ThemeToggle() {
	const t = useT();
	const { resolvedTheme, setTheme } = useTheme();
	const hydrated = useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
	);
	const dark = resolvedTheme === "dark";
	const label = !hydrated
		? t("Switch theme")
		: dark
			? t("Switch to light theme")
			: t("Switch to dark theme");

	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={label}
			onClick={() => setTheme(dark ? "light" : "dark")}
		>
			<Light className="size-5 dark:hidden" />
			<Asleep className="hidden size-5 dark:block" />
		</Button>
	);
}
