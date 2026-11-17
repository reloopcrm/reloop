"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";

const CHOICES = ["system", "light", "dark"] as const;

type Choice = (typeof CHOICES)[number];

function isChoice(value: string): value is Choice {
	return CHOICES.some((choice) => choice === value);
}

const subscribe = () => () => undefined;

function useMounted() {
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
	);
}

export function Appearance() {
	const { theme, setTheme } = useTheme();
	const mounted = useMounted();
	const t = useT();

	const labels = {
		system: t("System"),
		light: t("Light"),
		dark: t("Dark"),
	} satisfies Record<Choice, string>;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Appearance")}</CardTitle>
				<CardDescription>
					{t("Only for you, only in this browser.")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ToggleGroup
					type="single"
					variant="quiet"
					aria-label={t("Appearance")}
					value={mounted && theme && isChoice(theme) ? theme : ""}
					onValueChange={(value) => {
						if (isChoice(value)) setTheme(value);
					}}
				>
					{CHOICES.map((choice) => (
						<ToggleGroupItem key={choice} value={choice}>
							{labels[choice]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</CardContent>
		</Card>
	);
}
