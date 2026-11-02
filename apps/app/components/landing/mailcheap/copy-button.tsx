"use client";

import { useState } from "react";
import { COPY_FEEDBACK_MS } from "@/components/site";

export type CopyLabels = { copy: string; copied: string; failed: string };

type CopyState = "idle" | "copied" | "failed";

export function CopyButton({
	text,
	labels,
}: {
	text: string;
	labels: CopyLabels;
}) {
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

	return (
		<>
			<span role="status" aria-live="polite" className="mc-copy-status">
				{state === "failed" ? labels.failed : null}
			</span>
			<button type="button" className="mc-copy" onClick={copy}>
				{state === "copied" ? labels.copied : labels.copy}
			</button>
		</>
	);
}
