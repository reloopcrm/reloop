"use client";

import { useUiT } from "@crm/ui/lib/i18n";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import type * as React from "react";

export function Suggestion({
	value,
	rationale,
	instruction,
	pending = false,
	onAccept,
	onDismiss,
}: {
	value: React.ReactNode;
	rationale?: React.ReactNode;
	instruction?: string;
	pending?: boolean;
	onAccept: () => void;
	onDismiss: () => void;
}) {
	const t = useUiT();
	return (
		<div
			data-slot="suggestion"
			className="flex min-w-0 items-start gap-2 py-1 text-muted-foreground text-xs"
		>
			<div className="min-w-0 flex-1 space-y-0.5">
				<p className="truncate">
					<span className="text-foreground">{value}</span>
				</p>
				{rationale ? <p className="text-pretty">{rationale}</p> : null}
				{instruction ? (
					<p className="text-pretty text-faint-foreground">{instruction}</p>
				) : null}
			</div>

			<div className="flex shrink-0 items-center gap-1">
				{pending ? (
					<Spinner className="size-3" />
				) : (
					<>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onAccept}
							aria-label={
								instruction ? `${t("Accept")}: ${instruction}` : t("Accept")
							}
						>
							<Icon icon={Checkmark} />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onDismiss}
							aria-label={t("Dismiss")}
						>
							<Icon icon={Close} />
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
