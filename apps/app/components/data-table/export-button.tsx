"use client";

import Download from "@carbon/icons-react/es/Download";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n/client";

export type ExportEntity = "contacts" | "companies" | "deals";

class ExportFailed extends Error {}

const FILENAME = /filename="([^"]+)"/;

export function exportFilename(
	disposition: string | null,
	fallback: string,
): string {
	return FILENAME.exec(disposition ?? "")?.[1] ?? fallback;
}

export function ExportButton({
	entity,
	input,
	variant = "outline",
}: {
	entity: ExportEntity;
	input: unknown;
	variant?: "outline" | "link";
}) {
	const t = useT();
	const locale = useLocale();

	const download = async () => {
		const query = new URLSearchParams({
			filter: JSON.stringify(input),
			locale,
			zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		});
		let response: Response;

		try {
			response = await fetch(`/api/exports/${entity}?${query}`, {
				credentials: "same-origin",
			});
		} catch {
			toast.error(t("The export did not finish. Try again."));
			throw new ExportFailed();
		}

		if (response.status === 401) {
			toast.error(t("Your session ended. Sign in again."));
			throw new ExportFailed();
		}

		if (!response.ok) {
			toast.error(t("The export did not finish. Try again."));
			throw new ExportFailed();
		}

		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = exportFilename(
			response.headers.get("content-disposition"),
			`${entity}-${new Date().toISOString().slice(0, 10)}.csv`,
		);
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	};

	const action = useAsyncAction({ action: download });

	return (
		<Button
			variant={variant}
			size="sm"
			align="toolbar"
			onClick={() => action.run()}
			disabled={action.pending}
		>
			<AsyncButtonContent
				status={action.status}
				pendingLabel={t("Preparing…")}
				successLabel={t("Downloaded")}
			>
				{variant === "link" ? null : <Download data-icon="inline-start" />}
				{t("Export CSV")}
			</AsyncButtonContent>
		</Button>
	);
}
