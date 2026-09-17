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
import { Link } from "@crm/ui/components/link";
import { cacheLife } from "next/cache";
import type * as React from "react";
import { DOCS, type DocFile, docPath } from "./docs-config";
import { LandingShell } from "./landing-shell";
import { type Block, parseMarkdown } from "./markdown";

const ORDER = [
	{ href: DOCS.path, title: "Overview" },
	...DOCS.pages.map((page) => ({
		href: docPath(page.slug),
		title: page.title,
	})),
];

export async function readDoc(file: DocFile): Promise<Block[] | null> {
	"use cache";
	cacheLife(DOCS.cache.life);
	try {
		const source = await readFile(
			join(process.cwd(), ...DOCS.root, ...DOCS.files[file]),
			"utf8",
		);
		return parseMarkdown(source);
	} catch {
		return null;
	}
}

function DocsNavList({ current }: { current: string }) {
	return (
		<ul className="flex flex-col gap-1 text-sm/6">
			{ORDER.map((item) => {
				const active = item.href === current;
				return (
					<li
						key={item.href}
						className={active ? "text-foreground" : "text-muted-foreground"}
					>
						<Link
							variant="quiet"
							href={item.href}
							aria-current={active ? "page" : undefined}
						>
							{item.title}
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

function PageLinks({ current }: { current: string }) {
	const at = ORDER.findIndex((item) => item.href === current);
	const previous = at > 0 ? ORDER[at - 1] : undefined;
	const next = at >= 0 ? ORDER[at + 1] : undefined;

	return (
		<nav
			aria-label="Previous and next page"
			className="flex justify-between gap-6 border-border border-t pt-6 text-sm/6"
		>
			{previous ? (
				<Link variant="quiet" href={previous.href}>
					Previous: {previous.title}
				</Link>
			) : (
				<span />
			)}
			{next ? (
				<Link variant="quiet" href={next.href}>
					Next: {next.title}
				</Link>
			) : null}
		</nav>
	);
}

export function DocsShell({
	current,
	children,
}: {
	current: string;
	children: React.ReactNode;
}) {
	return (
		<LandingShell>
			<div className="flex w-full max-w-(--container-page-wide) flex-1 flex-col gap-6 px-6 py-10 md:flex-row md:gap-12">
				<aside className="hidden w-56 shrink-0 md:block">
					<nav aria-label="Documentation">
						<DocsNavList current={current} />
					</nav>
				</aside>

				<Collapsible className="md:hidden">
					<CollapsibleTrigger asChild>
						<Button variant="outline" size="sm">
							All pages
							<Icon icon={ChevronDown} data-icon="inline-end" />
						</Button>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<nav aria-label="Documentation" className="pt-4">
							<DocsNavList current={current} />
						</nav>
					</CollapsibleContent>
				</Collapsible>

				<main className="flex w-full min-w-0 max-w-(--container-page) flex-1 flex-col gap-6">
					{children}
					<PageLinks current={current} />
				</main>
			</div>
		</LandingShell>
	);
}
