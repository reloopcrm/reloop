"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Copy from "@carbon/icons-react/es/Copy";
import { Button } from "@crm/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import { type AiSelectionGroup, winBackAiPrompt } from "./win-back-ai-prompt";
import { WIN_BACK_UI } from "./win-back-config";

export function WinBackCopyForAi({ groups }: { groups: AiSelectionGroup[] }) {
	const t = useT();
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(winBackAiPrompt(groups, t));
			setCopied(true);
			setTimeout(() => setCopied(false), WIN_BACK_UI.copyForAi.copiedMs);
		} catch {
			toast.error(
				t("Could not copy. Allow the clipboard in your browser and try again."),
			);
		}
	};

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={() => void copy()}
			disabled={groups.length === 0}
		>
			{copied ? (
				<Checkmark data-icon="inline-start" />
			) : (
				<Copy data-icon="inline-start" />
			)}
			<span aria-live="polite">{copied ? t("Copied") : t("Copy for AI")}</span>
		</Button>
	);
}
