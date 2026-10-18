"use client";

import { useUiT } from "@crm/ui/lib/i18n";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { cleanEmailBody } from "@crm/ui/lib/email-text";
import { cn } from "@crm/ui/lib/utils";
import { cva } from "class-variance-authority";
import type * as React from "react";

const bodyVariants = cva(
	"whitespace-pre-wrap text-pretty wrap-anywhere text-body-foreground",
	{
		variants: {
			size: {
				compact: "text-xs/5",
				reading: "text-md/relaxed",
			},
		},
		defaultVariants: { size: "compact" },
	},
);

const nameVariants = cva("font-medium", {
	variants: {
		size: {
			compact: "text-xs",
			reading: "text-sm",
		},
	},
	defaultVariants: { size: "compact" },
});

type ThreadMessageSize = "compact" | "reading";

function MessageBody({
	body,
	size,
	action,
}: {
	body: string | null;
	size: ThreadMessageSize;
	action?: React.ReactNode;
}) {
	const t = useUiT();
	const cleaned = body ? cleanEmailBody(body) : null;

	return (
		<>
			{cleaned?.text ? (
				<p className={bodyVariants({ size })}>{cleaned.text}</p>
			) : cleaned?.signature ? null : (
				<p className="text-muted-foreground text-xs italic">
					{t("No message body.")}
				</p>
			)}

			{cleaned?.signature ? (
				<details className="group/signature text-xs">
					<summary className="cursor-pointer list-none text-faint-foreground transition-colors hover:text-body-foreground [&::-webkit-details-marker]:hidden">
						<span className="group-open/signature:hidden">
							{t("Show signature")}
						</span>
						<span className="hidden group-open/signature:inline">
							{t("Hide signature")}
						</span>
					</summary>
					<p className="mt-1 whitespace-pre-wrap text-faint-foreground text-xs/5">
						{cleaned.signature}
					</p>
				</details>
			) : null}

			{action ? (
				<div className="flex flex-wrap gap-2 text-xs">{action}</div>
			) : null}
		</>
	);
}

function ThreadMessage({
	from,
	fromEmail,
	fromImageUrl,
	sentAt,
	direction,
	body,
	action,
	size = "compact",
	collapsed = false,
	preview,
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
	size?: ThreadMessageSize;
	collapsed?: boolean;
	preview?: string | null;
}) {
	const outbound = direction === "OUTBOUND";
	const edge = outbound ? "border-l-border-strong" : "border-l-border";

	if (collapsed) {
		return (
			<details
				id={props.id}
				data-slot="thread-message"
				data-direction={direction}
				data-collapsed=""
				className={cn("group/message border-l pl-3", edge, className)}
			>
				<summary className="flex cursor-pointer list-none items-center gap-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
					<PersonAvatar
						src={fromImageUrl}
						name={from}
						email={fromEmail}
						size="sm"
					/>
					<span className="shrink-0 font-medium text-xs">{from}</span>
					<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs group-open/message:invisible">
						{preview}
					</span>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{sentAt}
					</span>
				</summary>
				<div className="flex flex-col gap-1 pb-2">
					<MessageBody body={body} size={size} action={action} />
				</div>
			</details>
		);
	}

	return (
		<article
			data-slot="thread-message"
			data-direction={direction}
			className={cn("flex gap-2.5 border-l py-2 pl-3", edge, className)}
			{...props}
		>
			<PersonAvatar
				src={fromImageUrl}
				name={from}
				email={fromEmail}
				size="sm"
				className="mt-0.5"
			/>

			<div
				className={cn(
					"flex min-w-0 flex-1 flex-col",
					size === "reading" ? "gap-2" : "gap-0.5",
				)}
			>
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className={nameVariants({ size })}>{from}</span>
					<span className="truncate text-muted-foreground text-xs">
						{fromEmail}
					</span>
					<span className="ml-auto text-muted-foreground text-xs tabular-nums">
						{sentAt}
					</span>
				</div>

				<MessageBody body={body} size={size} action={action} />
			</div>
		</article>
	);
}

export { ThreadMessage };
