"use client";

import Copy from "@carbon/icons-react/es/Copy";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n/client";

export function CopyValue({ value, label }: { value: string; label: string }) {
	const t = useT();
	const locale = useLocale();
	const name = locale === "en" ? label.toLowerCase() : t(label);

	const unavailable = () =>
		toast.error(
			t("Could not copy the {label}. Select it instead.", { label: name }),
		);

	return (
		<Button
			variant="ghost"
			size="icon"
			type="button"
			onClick={() => {
				const clipboard = navigator.clipboard;

				if (!clipboard) {
					unavailable();
					return;
				}

				clipboard
					.writeText(value)
					.then(() => toast.success(t("{label} copied.", { label: t(label) })))
					.catch(unavailable);
			}}
		>
			<Icon icon={Copy} />
			<span className="sr-only">{t("Copy {label}", { label: name })}</span>
		</Button>
	);
}
