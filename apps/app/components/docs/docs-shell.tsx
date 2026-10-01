import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { cacheLife } from "next/cache";
import NextLink from "next/link";
import type * as React from "react";
import { Eyebrow } from "@/components/site/eyebrow";
import { Section } from "@/components/site/section";
import { SITE_TYPE } from "@/components/site/typography";
import type { Translate } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";
import { DOCS, type DocFile, docPath } from "./docs-config";
import { LandingShell } from "./landing-shell";
import { type Block, type DocHeading, parseMarkdown } from "./markdown";

type DocLink = { href: string; title: string };

const LABEL = cn(
	SITE_TYPE.mono,
	"mb-4 font-(--site-weight-medium) text-(--ink-60) tracking-[0.1em]",
);

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

const OFFSET = {
	top: "top-[calc(var(--site-banner-offset)+var(--site-nav-height)+--spacing(8))]",
	height:
		"max-h-[calc(100svh-var(--site-banner-offset)-var(--site-nav-height)-(--spacing(16)))]",
	anchor:
		"[&_[id]]:scroll-mt-[calc(var(--site-banner-offset)+var(--site-nav-height)+--spacing(6))]",
} as const;

function order(t: Translate): DocLink[] {
	return [
		{ href: DOCS.path, title: t("Overview") },
		...DOCS.pages.map((page) => ({
			href: docPath(page.slug),
			title: t(page.title),
		})),
	];
}

export async function readDoc(file: DocFile): Promise<Block[] | null> {
	"use cache";
	cacheLife(DOCS.cache.life);
	const path = join(process.cwd(), ...DOCS.root, ...DOCS.files[file]);
	try {
		return parseMarkdown(await readFile(path, "utf8"));
	} catch (error) {
		console.error(`Docs: could not read ${path}.`, error);
		return null;
	}
}

function DocsNavList({
	items,
	current,
}: {
	items: DocLink[];
	current: string;
}) {
	return (
		<ul>
			{items.map((item) => (
				<li key={item.href}>
					<NextLink
						href={item.href}
						aria-current={item.href === current ? "page" : undefined}
						className={cn(
							FOCUS,
							"block rounded-(--site-radius) px-2.5 py-1.75 text-(--ink-60) text-(length:--site-text-small) leading-[1.3] transition-colors duration-200 ease-(--site-ease) hover:text-foreground aria-[current=page]:bg-(--active) aria-[current=page]:text-foreground motion-reduce:transition-none",
						)}
					>
						{item.title}
					</NextLink>
				</li>
			))}
		</ul>
	);
}

function PagerLink({
	link,
	label,
	next = false,
}: {
	link: DocLink;
	label: string;
	next?: boolean;
}) {
	return (
		<NextLink
			href={link.href}
			className={cn(
				FOCUS,
				"group grid gap-2 rounded-xs",
				next && "ms-auto text-end",
			)}
		>
			<span className={cn(SITE_TYPE.mono, "text-(--ink-60)")}>{label}</span>
			<span className="text-(length:--site-text-body) text-foreground underline underline-offset-3">
				{link.title}
			</span>
		</NextLink>
	);
}

function PageLinks({
	items,
	current,
	t,
}: {
	items: DocLink[];
	current: string;
	t: Translate;
}) {
	const at = items.findIndex((item) => item.href === current);
	const previous = at > 0 ? items[at - 1] : undefined;
	const next = at >= 0 ? items[at + 1] : undefined;

	return (
		<nav
			aria-label={t("Previous and next page")}
			className="mt-16 flex justify-between gap-6 border-border border-t pt-6 max-[900px]:mt-12"
		>
			{previous ? <PagerLink link={previous} label={t("Previous")} /> : null}
			{next ? <PagerLink link={next} label={t("Next")} next /> : null}
		</nav>
	);
}

function Outline({ headings, t }: { headings: DocHeading[]; t: Translate }) {
	if (!headings.length) return null;

	return (
		<nav
			aria-label={t("On this page")}
			className={cn(
				"sticky overflow-y-auto max-[1240px]:hidden",
				OFFSET.top,
				OFFSET.height,
			)}
		>
			<p className={LABEL}>{t("On this page")}</p>
			<ul>
				{headings.map((heading) => (
					<li key={heading.id}>
						<a
							href={`#${heading.id}`}
							className={cn(
								FOCUS,
								"block rounded-xs py-1.25 text-(--ink-60) text-(length:--site-text-small) leading-[1.35] wrap-anywhere transition-colors duration-200 ease-(--site-ease) hover:text-foreground motion-reduce:transition-none",
							)}
						>
							{heading.title}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}

export function DocsHeading({
	title,
	lede,
	eyebrow,
}: {
	title: string;
	lede: string;
	eyebrow?: string;
}) {
	return (
		<header>
			{eyebrow ? (
				<div className="mb-6.5 max-[900px]:mb-5">
					<Eyebrow>{eyebrow}</Eyebrow>
				</div>
			) : null}
			<h1 className={cn(SITE_TYPE.display2, "max-w-160 text-balance")}>
				{title}
			</h1>
			<p className="mt-6 text-pretty font-(--site-weight-light) font-serif text-(--ink-80) text-(length:--site-text-title-20) leading-(--site-leading-lede) tracking-(--site-tracking-lede) max-[900px]:mt-5 max-[900px]:text-lg">
				{lede}
			</p>
		</header>
	);
}

export async function DocsShell({
	current,
	outline = [],
	children,
}: {
	current: string;
	outline?: DocHeading[];
	children: React.ReactNode;
}) {
	const t = await getT();
	const items = order(t);

	return (
		<LandingShell>
			<Section
				corners="blue"
				spacing="none"
				className="pt-18 pb-28 max-[900px]:pt-10 max-[900px]:pb-16"
			>
				<div className="grid grid-cols-[--spacing(55)_minmax(0,1fr)_--spacing(50)] items-start gap-14 max-[1240px]:grid-cols-[--spacing(50)_minmax(0,1fr)] max-[1240px]:gap-12 max-[900px]:grid-cols-1 max-[900px]:gap-8">
					<aside className={cn("sticky max-[900px]:hidden", OFFSET.top)}>
						<p className={LABEL}>{t("All pages")}</p>
						<nav aria-label={t("Documentation")}>
							<DocsNavList items={items} current={current} />
						</nav>
					</aside>

					<Collapsible key={current} className="min-[901px]:hidden">
						<CollapsibleTrigger asChild>
							<Button variant="outline" size="sm" className="group/menu">
								{t("All pages")}
								<Icon
									icon={ChevronDown}
									data-icon="inline-end"
									className="group-data-[state=open]/menu:rotate-180"
								/>
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<nav
								aria-label={t("Documentation")}
								className="mt-3 border border-border bg-background p-2"
							>
								<DocsNavList items={items} current={current} />
							</nav>
						</CollapsibleContent>
					</Collapsible>

					<div className={cn("min-w-0 max-w-(--site-prose)", OFFSET.anchor)}>
						{children}
						<PageLinks items={items} current={current} t={t} />
					</div>

					<Outline headings={outline} t={t} />
				</div>
			</Section>
		</LandingShell>
	);
}
