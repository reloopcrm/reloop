import { Button } from "@crm/ui/components/button";
import { Display } from "@crm/ui/components/display";
import { Link } from "@crm/ui/components/link";
import { cn } from "@crm/ui/lib/utils";
import NextLink from "next/link";
import type * as React from "react";
import { marketingUrl } from "@/lib/site-links";
import { SectionHeading } from "./section-heading";

export const PRICING = {
	href: "/pricing",
	primary: "Start free trial",
	secondary: "See pricing",
} as const;

export type Tone = "default" | "secondary";

export type PageLink = { href: string; label: string };

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

export function PricingActions({ secondary }: { secondary?: PageLink }) {
	const link = secondary ?? {
		href: marketingUrl(PRICING.href),
		label: PRICING.secondary,
	};
	return (
		<div className="flex flex-wrap items-center justify-center gap-6">
			<Button size="pill" asChild>
				<NextLink href={marketingUrl(PRICING.href)}>{PRICING.primary}</NextLink>
			</Button>
			<Button variant="link" size="pill" asChild>
				<NextLink href={link.href}>{link.label}</NextLink>
			</Button>
		</div>
	);
}

export function PageHero({
	title,
	lede,
	size = "section",
	actions = <PricingActions />,
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

export function CloudBanner() {
	return (
		<Band className="pt-0 md:pt-0">
			<div className="flex w-full flex-col items-center gap-6 text-center">
				<Display size="title" asChild>
					<h2>Rather not run a server?</h2>
				</Display>
				<p className="max-w-(--container-sheet) text-body-foreground text-lg md:text-xl">
					Reloop Cloud does it for you.
				</p>
				<Button size="pill" asChild>
					<NextLink href={marketingUrl(PRICING.href)}>
						{PRICING.secondary}
					</NextLink>
				</Button>
			</div>
		</Band>
	);
}

export function PageSection({
	title,
	lede,
	tone,
	children,
}: {
	title: string;
	lede?: string;
	tone?: Tone;
	children: React.ReactNode;
}) {
	return (
		<Band tone={tone}>
			<SectionHeading title={title} lede={lede} />
			{children}
		</Band>
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

export function SelfHostNote({
	text = "Rather run it on your own server? Reloop CRM is open source.",
	link = "Read what self-hosting takes.",
}: {
	text?: string;
	link?: string;
}) {
	return (
		<p className="text-center text-muted-foreground text-sm/6">
			{text}{" "}
			<Link variant="quiet" href={marketingUrl("/self-hosted-crm")}>
				{link}
			</Link>
		</p>
	);
}

export function CardGrid({
	columns = 2,
	children,
}: {
	columns?: 2 | 3;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"grid w-full gap-4",
				columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2",
			)}
		>
			{children}
		</div>
	);
}

export function ClosingCta({
	title,
	lede,
	tone,
	secondary,
}: {
	title: string;
	lede?: string;
	tone?: Tone;
	secondary?: PageLink;
}) {
	return (
		<Band tone={tone}>
			<div className="flex w-full flex-col items-center gap-6 text-center">
				<Display size="title" asChild>
					<h2 className="max-w-(--container-page)">{title}</h2>
				</Display>
				{lede ? (
					<p className="max-w-(--container-sheet) text-body-foreground text-xl">
						{lede}
					</p>
				) : null}
				<div className="pt-4">
					<PricingActions secondary={secondary} />
				</div>
			</div>
		</Band>
	);
}
