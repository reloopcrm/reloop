"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { useT } from "@/lib/i18n/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CopyValue } from "../copy-value";

type CreatedApiKey = RouterOutputs["apiKeys"]["create"];

export function CreatedApiKeyDialog({
	apiKey,
	onOpenChange,
}: {
	apiKey: CreatedApiKey | null;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useT();

	return (
		<Dialog open={apiKey !== null} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{t("{name} created", { name: apiKey?.name ?? t("API key") })}
					</DialogTitle>
					<DialogDescription>
						{t("Copy it now. Nobody, including us, can show it to you again.")}
					</DialogDescription>
				</DialogHeader>

				<InputGroup>
					<InputGroupInput
						value={apiKey?.key ?? ""}
						readOnly
						className="font-mono"
					/>
					<InputGroupAddon align="inline-end">
						<CopyValue value={apiKey?.key ?? ""} label="API key" />
					</InputGroupAddon>
				</InputGroup>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)}>{t("Done")}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
