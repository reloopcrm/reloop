"use client";

import { useUiT } from "@crm/ui/lib/i18n";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { cleanEmailBody } from "@crm/ui/lib/email-text";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function ThreadMessage({
	from,
	fromEmail,
	fromImageUrl,
	sentAt,
	direction,
	body,
	action,
	className,
	...props
}: Omit<React.ComponentProps<"article">, "children"> & {
	from: string;
	fromEmail: string;
	fromImageUrl?: string | null;
	sentAt: React.ReactNode;
	direction: "INBOUND" | "OUTBOUND";
	body: string | null;
	action?: React.ReactNode;
}) {
	const t = useUiT();
	const outbound = direction === "OUTBOUND";
	const cleaned = body ? cleanEmailBody(body) : null;

	return (
		<article
			data-slot="thread-message"
			data-direction={direction}
			className={cn(
				"flex gap-2.5 border-l py-2 pl-3",
				outbound ? "border-l-border-strong" : "border-l-border",
				className,
			)}
			{...props}
		>
			<PersonAvatar
				src={fromImageUrl}
				name={from}
				email={fromEmail}
				size="sm"
				className="mt-0.5"
			/>

			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="font-medium text-xs">{from}</span>
					<span className="truncate text-muted-foreground text-xs">
						{fromEmail}
					</span>
					<span className="ml-auto text-muted-foreground text-xs tabular-nums">
						{sentAt}
					</span>
				</div>

				{cleaned?.text ? (
					<p className="whitespace-pre-wrap text-pretty text-body-foreground text-xs/5">
						{cleaned.text}
					</p>
				) : cleaned?.signature ? null : (
					<p className="text-muted-foreground text-xs italic">
						{t("No message body.")}
					</p>
				)}

				{cleaned?.signature ? (
					<details className="group text-xs">
						<summary className="cursor-pointer list-none text-faint-foreground transition-colors hover:text-body-foreground">
							<span className="group-open:hidden">{t("Show signature")}</span>
							<span className="hidden group-open:inline">{t("Hide signature")}</span>
						</summary>
						<p className="mt-1 whitespace-pre-wrap text-faint-foreground text-xs/5">
							{cleaned.signature}
						</p>
					</details>
				) : null}

				{action ? <div className="flex gap-3 text-xs">{action}</div> : null}
			</div>
		</article>
	);
}

export { ThreadMessage };
