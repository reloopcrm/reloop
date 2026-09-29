"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Copy from "@carbon/icons-react/es/Copy";
import { Button } from "@crm/ui/components/button";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { COPY_FEEDBACK_MS } from "./site";

export function CopyCommand({ command }: { command: string }) {
	const t = useT();
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

	async function copy() {
		try {
			await navigator.clipboard.writeText(command);
			setState("copied");
			setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
		} catch {
			setState("failed");
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 font-mono text-foreground text-xs/5">
				<code>{command}</code>
			</pre>
			<div className="flex flex-wrap items-center gap-3">
				<Button onClick={copy}>
					{state === "copied" ? (
						<Checkmark data-icon="inline-start" />
					) : (
						<Copy data-icon="inline-start" />
					)}
					{state === "copied" ? t("Copied") : t("Copy command")}
				</Button>
				{state === "failed" ? (
					<p role="status" className="text-muted-foreground text-xs">
						{t("Copying failed. Select the command and copy it by hand.")}
					</p>
				) : null}
			</div>
		</div>
	);
}
