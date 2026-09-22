"use client";

import Earth from "@carbon/icons-react/es/Earth";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { useRouter } from "next/navigation";
import { useLocale, useT, writeLocaleCookie } from "@/lib/i18n/client";
import { isLocale, LOCALE, LOCALES } from "@/lib/i18n/locale";

export function LanguageSwitcher() {
	const locale = useLocale();
	const router = useRouter();
	const t = useT();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" aria-label={t("Language")}>
					<Earth data-icon="inline-start" />
					<span className="uppercase">{locale.split("-")[0]}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-44">
				<DropdownMenuRadioGroup
					value={locale}
					onValueChange={(value) => {
						if (!isLocale(value)) return;
						writeLocaleCookie(value);
						router.refresh();
					}}
				>
					{LOCALES.map((value) => (
						<DropdownMenuRadioItem key={value} value={value}>
							{LOCALE.names[value]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
