"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import { Link } from "@crm/ui/components/link";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { REPO_URL } from "@/components/landing/site";
import { useLocale, useT, writeLocaleCookie } from "@/lib/i18n/client";
import {
	isLocale,
	isMachineTranslated,
	LOCALE,
	LOCALES,
} from "@/lib/i18n/locale";

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
					{t("Only for you, only in this browser.")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Field>
					<FieldLabel htmlFor={fieldId}>{t("Language")}</FieldLabel>
					<Select
						value={locale}
						onValueChange={(value) => {
							if (!isLocale(value)) return;
							writeLocaleCookie(value);
							router.refresh();
						}}
					>
						<SelectTrigger id={fieldId} className="w-60">
							<SelectValue placeholder={LOCALE.names[locale]}>
								{LOCALE.names[locale]}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{LOCALES.map((value) => (
								<SelectItem key={value} value={value}>
									{LOCALE.names[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FieldDescription>
						{isMachineTranslated(locale)
							? t("{language} is machine translated.", {
									language: LOCALE.names[locale],
								})
							: t(
									"English and German are written by people. A machine writes the others.",
								)}{" "}
						<Link href={REPO_URL} target="_blank" rel="noreferrer">
							{t("Fix a word on GitHub")}
						</Link>
					</FieldDescription>
				</Field>
			</CardContent>
		</Card>
	);
}
