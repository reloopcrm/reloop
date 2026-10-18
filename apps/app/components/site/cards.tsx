import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { type SiteTone, Square } from "./eyebrow";
import { Corners } from "./section";
import { SITE_TYPE } from "./typography";

export function FeatureCard({
	title,
	tone = "blue",
	children,
}: {
	title: string;
	tone?: SiteTone;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-[--spacing(2)_1fr] items-start gap-6 border border-border p-6 pb-7 max-[900px]:grid-cols-1 max-[900px]:gap-0 max-[900px]:p-5">
			<span className="mt-1.5 max-[900px]:hidden">
				<Square tone={tone} />
			</span>
			<span>
				<h3 className={SITE_TYPE.title20}>{title}</h3>
				<div className="mt-2 text-(--ink-70) text-(length:--site-text-body) leading-(--site-leading-body) [&_a]:underline [&_a]:underline-offset-3">
					{children}
				</div>
			</span>
		</div>
	);
}

export function NoteCard({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="border border-border bg-background px-6 py-7">
			<h3 className={SITE_TYPE.title20}>{title}</h3>
			<div className={cn(SITE_TYPE.lede, "mt-3 text-(--ink-80)")}>
				{children}
			</div>
		</div>
	);
}

export function Frame({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"relative grid place-items-center overflow-hidden border border-border bg-(--tile) p-8 max-[900px]:p-3",
				className,
			)}
		>
			<Corners />
			{children}
		</div>
	);
}

export function TileCard({
	title,
	media,
	children,
}: {
	title: string;
	media: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div>
			<Frame className="border-0">{media}</Frame>
			<h3 className={cn(SITE_TYPE.title24, "mt-6")}>{title}</h3>
			<div className={cn(SITE_TYPE.lede, "mt-3 text-(--ink-80)")}>
				{children}
			</div>
		</div>
	);
}
