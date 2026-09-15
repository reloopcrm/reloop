"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldLabel } from "@crm/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { useLocale, useT, writeLocaleCookie } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n/locale";

const NAMES = {
	de: "Deutsch",
	en: "English",
} satisfies Record<(typeof LOCALES)[number], string>;

export function Language() {
	const locale = useLocale();
	const router = useRouter();
	const t = useT();
	const fieldId = useId();

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Language")}</CardTitle>
				<CardDescription>
					{t("The language of every screen, for you on this browser.")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Field>
					<FieldLabel htmlFor={fieldId}>{t("Language")}</FieldLabel>
					<Select
						value={locale}
						onValueChange={(value) => {
							if (value !== "de" && value !== "en") return;
							writeLocaleCookie(value);
							router.refresh();
						}}
					>
						<SelectTrigger id={fieldId} className="w-60">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LOCALES.map((value) => (
								<SelectItem key={value} value={value}>
									{NAMES[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			</CardContent>
		</Card>
	);
}
