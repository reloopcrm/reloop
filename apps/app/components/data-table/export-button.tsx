"use client";

import Download from "@carbon/icons-react/es/Download";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";

export type ExportEntity = "contacts" | "companies" | "deals";

class ExportFailed extends Error {}

export function ExportButton({
	entity,
	input,
}: {
	entity: ExportEntity;
	input: unknown;
}) {
	const t = useT();

	const download = async () => {
		const filter = encodeURIComponent(JSON.stringify(input));
		let response: Response;

		try {
			response = await fetch(`/api/exports/${entity}?filter=${filter}`, {
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
		link.download = `${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	};

	const action = useAsyncAction({ action: download });

	return (
		<Button
			variant="outline"
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
				<Download data-icon="inline-start" />
				{t("Export CSV")}
			</AsyncButtonContent>
		</Button>
	);
}
