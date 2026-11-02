import NextLink from "next/link";
import type * as React from "react";
import { DOCS, docPath } from "@/components/docs/docs-config";
import type { DocHeading } from "@/components/docs/markdown";
import type { Translate } from "@/lib/i18n/locale";
import { Article } from "./article";
import type { MarkdownLabels } from "./markdown";
import type { SiteLink } from "./shell";

export function docsLinks(t: Translate): SiteLink[] {
	return [
		{ href: DOCS.path, label: t("Overview") },
		...DOCS.pages.map((page) => ({
			href: docPath(page.slug),
			label: t(page.title),
		})),
	];
}

export function markdownLabels(t: Translate): MarkdownLabels {
	return {
		terminal: t("Terminal"),
		copy: t("Copy"),
		copied: t("Copied"),
		failed: t("Copying failed. Select the command and copy it by hand."),
	};
}

function Pager({
	items,
	current,
	t,
}: {
	items: readonly SiteLink[];
	current: string;
	t: Translate;
}) {
	const at = items.findIndex((item) => item.href === current);
	const previous = at > 0 ? items[at - 1] : undefined;
	const next = at >= 0 ? items[at + 1] : undefined;
	if (!previous && !next) return null;

	return (
		<nav className="mc-doc-pager" aria-label={t("Previous and next page")}>
			{previous ? (
				<NextLink href={previous.href} className="mc-doc-pager-link">
					<span className="mc-kicker">{t("Previous")}</span>
					<span>{previous.label}</span>
				</NextLink>
			) : null}
			{next ? (
				<NextLink
					href={next.href}
					className="mc-doc-pager-link mc-doc-pager-next"
				>
					<span className="mc-kicker">{t("Next")}</span>
					<span>{next.label}</span>
				</NextLink>
			) : null}
		</nav>
	);
}

export function DocsArticle({
	t,
	current,
	outline,
	title,
	lede,
	children,
}: {
	t: Translate;
	current: string;
	outline?: readonly DocHeading[];
	title: string;
	lede: React.ReactNode;
	children: React.ReactNode;
}) {
	const items = docsLinks(t);

	return (
		<Article
			groups={[{ title: t("Docs"), links: items }]}
			current={current}
			navLabel={t("Documentation")}
			toc={outline?.map((heading) => ({
				id: heading.id,
				label: heading.title,
			}))}
			tocLabel={t("On this page")}
			kicker={t("Docs")}
			title={title}
			lede={lede}
		>
			{children}
			<Pager items={items} current={current} t={t} />
		</Article>
	);
}
