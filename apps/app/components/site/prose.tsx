import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { Eyebrow } from "./eyebrow";
import { Section } from "./section";
import { SITE_TYPE } from "./typography";

export function ProsePage({
	eyebrow,
	title,
	lede,
	children,
}: {
	eyebrow: string;
	title: string;
	lede: string;
	children: React.ReactNode;
}) {
	return (
		<Section
			spacing="none"
			className="pt-18 pb-28 max-[900px]:pt-12 max-[900px]:pb-16"
		>
			<article className="max-w-(--site-prose)">
				<header>
					<Eyebrow>{eyebrow}</Eyebrow>
					<h1 className={cn(SITE_TYPE.display2, "mt-6 max-w-160 text-balance")}>
						{title}
					</h1>
					<p className="mt-6 text-pretty text-(--ink-80) text-(length:--site-text-title-20) leading-(--site-leading-lede)">
						{lede}
					</p>
				</header>
				<div className="mt-12 text-(--ink-80) text-(length:--site-text-body) leading-[1.6] [&>*+*]:mt-4 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-3 [&>h2]:mt-12 [&>h2+*]:mt-4">
					{children}
				</div>
			</article>
		</Section>
	);
}

export function ProseHeading({ children }: { children: React.ReactNode }) {
	return (
		<h2 className={cn(SITE_TYPE.title24, "text-foreground")}>{children}</h2>
	);
}
