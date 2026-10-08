"use client";

import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { type RecordKind, useOpenRecord } from "./record-stack";

const RECORD_LINK =
	"min-w-0 truncate text-left text-muted-foreground hover:text-foreground hover:underline";

export function RecordLink({
	kind,
	id,
	className,
	children,
}: {
	kind: RecordKind;
	id: string;
	className?: string;
	children: ReactNode;
}) {
	const open = useOpenRecord();

	return (
		<button
			type="button"
			onClick={(event) => {
				event.stopPropagation();
				open({ kind, id });
			}}
			className={cn(RECORD_LINK, className)}
		>
			{children}
		</button>
	);
}

export function RecordPageLink({
	href,
	className,
	children,
}: {
	href: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Link
			href={href}
			onClick={(event) => event.stopPropagation()}
			className={cn(RECORD_LINK, className)}
		>
			{children}
		</Link>
	);
}
