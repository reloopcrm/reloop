import { Display } from "@crm/ui/components/display";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

export type Tone = "default" | "secondary";

export function Band({
	tone = "default",
	className,
	children,
}: {
	tone?: Tone;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<section
			className={cn(
				"w-full px-6 py-20 md:py-24",
				tone === "secondary" && "bg-secondary",
				className,
			)}
		>
			<div className="mx-auto flex w-full max-w-(--container-page-wide) flex-col items-center gap-12">
				{children}
			</div>
		</section>
	);
}

export function PageHero({
	title,
	lede,
	size = "section",
	actions = null,
}: {
	title: string;
	lede: string;
	size?: "section" | "title";
	actions?: React.ReactNode;
}) {
	return (
		<section className="w-full px-6 pt-20 pb-20 md:pt-24 md:pb-24">
			<div className="mx-auto flex w-full max-w-(--container-page-wide) flex-col items-center gap-10 text-center">
				<Display size={size}>{title}</Display>
				<p className="max-w-(--container-sheet) text-pretty text-body-foreground text-lg md:text-2xl">
					{lede}
				</p>
				{actions}
			</div>
		</section>
	);
}

export function Prose({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex w-full max-w-(--container-page) flex-col gap-4 text-body-foreground text-lg/8">
			{children}
		</div>
	);
}

export function ProseHeading({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="pt-8 font-semibold text-2xl text-foreground tracking-tight">
			{children}
		</h2>
	);
}
