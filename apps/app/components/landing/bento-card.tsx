import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

export function BentoCard({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex flex-col overflow-clip rounded-lg border border-border bg-card p-7",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function CardHeading({ title, body }: { title: string; body: string }) {
	return (
		<div className="flex flex-col gap-2">
			<CardTitle>{title}</CardTitle>
			<CardBody>{body}</CardBody>
		</div>
	);
}

export function CardTitle({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-balance font-medium text-[19px]/[26px] tracking-tight">
			{children}
		</h3>
	);
}

export function CardBody({ children }: { children: React.ReactNode }) {
	return <p className="text-muted-foreground text-sm/[23px]">{children}</p>;
}
