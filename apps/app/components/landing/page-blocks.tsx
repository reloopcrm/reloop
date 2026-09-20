import { Button } from "@crm/ui/components/button";
import NextLink from "next/link";
import type * as React from "react";
import { SectionHeading } from "./section-heading";

export function PageHero({ title, lede }: { title: string; lede: string }) {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20 pb-10 md:pt-30">
			<div className="relative flex w-full max-w-(--container-page-wide) flex-col items-center gap-7">
				<h1 className="max-w-(--container-page) text-balance text-center font-semibold text-5xl/[52px] tracking-tight md:text-[72px]/[76px]">
					{title}
				</h1>
				<p className="max-w-(--container-sheet) text-pretty text-center text-muted-foreground text-lg/[28px] md:text-xl/[30px]">
					{lede}
				</p>
				<div className="flex flex-wrap items-center justify-center gap-3 pt-3">
					<Button size="xl" asChild>
						<NextLink href="/get-started">Get started</NextLink>
					</Button>
				</div>
			</div>
		</section>
	);
}

export function PageSection({
	title,
	lede,
	children,
}: {
	title: string;
	lede?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20 pb-10">
			<div className="flex w-full max-w-(--container-page-wide) flex-col gap-12">
				<SectionHeading title={title} lede={lede} />
				{children}
			</div>
		</section>
	);
}

export function Prose({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex max-w-(--container-page) flex-col gap-4 text-body-foreground text-sm/6">
			{children}
		</div>
	);
}

export function CardGrid({ children }: { children: React.ReactNode }) {
	return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

export function ClosingCta({
	title,
	links,
}: {
	title: string;
	links: readonly { href: string; label: string }[];
}) {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center gap-7 px-6 pt-10 pb-20 md:pb-30">
			<h2 className="text-balance text-center font-semibold text-4xl/[42px] tracking-tight md:text-[44px]/[50px]">
				{title}
			</h2>
			<div className="flex flex-wrap items-center justify-center gap-3">
				{links.map((link) => (
					<Button key={link.href} variant="outline" size="xl" asChild>
						<NextLink href={link.href}>{link.label}</NextLink>
					</Button>
				))}
			</div>
		</section>
	);
}
