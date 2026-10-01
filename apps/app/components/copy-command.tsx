"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Copy from "@carbon/icons-react/es/Copy";
import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { COPY_FEEDBACK_MS } from "./site";
import { SITE_TYPE } from "./site/typography";

type CopyState = "idle" | "copied" | "failed";

function useCopy(text: string) {
	const [state, setState] = useState<CopyState>("idle");

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			setState("copied");
			setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
		} catch {
			setState("failed");
		}
	}

	return { state, copy };
}

export function CopyCommand({ command }: { command: string }) {
	const t = useT();
	const { state, copy } = useCopy(command);

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

export function CopyCode({ code }: { code: string }) {
	const t = useT();
	const { state, copy } = useCopy(code);

	return (
		<>
			<button
				type="button"
				onClick={copy}
				className={cn(
					SITE_TYPE.mono,
					"absolute top-3 right-3 h-7 rounded-(--site-radius) border px-2.5 max-[900px]:static max-[900px]:mx-4 max-[900px]:mb-4 outline-none transition-colors duration-200 ease-(--site-ease) focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
					state === "copied"
						? "border-transparent bg-foreground text-background"
						: "border-(--line-strong) bg-background text-(--ink-70) hover:text-foreground",
				)}
			>
				{state === "copied" ? t("Copied") : t("Copy")}
			</button>
			<span role="status" className="sr-only">
				{state === "copied" ? t("Copied") : null}
				{state === "failed"
					? t("Copying failed. Select the command and copy it by hand.")
					: null}
			</span>
		</>
	);
}
