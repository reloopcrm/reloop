"use client";

import { useState } from "react";
import { COPY_FEEDBACK_MS } from "@/components/site";

export function CopyButton({
	text,
	labels,
}: {
	text: string;
	labels: { copy: string; copied: string };
}) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
		} catch {
			setCopied(false);
		}
	}

	return (
		<button type="button" className="mc-copy" onClick={copy}>
			{copied ? labels.copied : labels.copy}
		</button>
	);
}
