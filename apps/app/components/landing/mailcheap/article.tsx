import NextLink from "next/link";
import type * as React from "react";
import type { SiteLink } from "./shell";

export type ArticleNavGroup = { title: string; links: readonly SiteLink[] };

export type TocEntry = { id: string; label: string };

function lines(title: string): React.ReactNode {
	const parts = title.split("\n");
	if (parts.length === 1) return title;
	return parts.map((line) => (
		<span key={line} className="mc-line">
			{line}
		</span>
	));
}

export function Article({
	groups,
	current,
	navLabel,
	toc,
	tocLabel,
	kicker,
	title,
	lede,
	actions,
	children,
}: {
	groups: readonly ArticleNavGroup[];
	current: string;
	navLabel: string;
	toc?: readonly TocEntry[];
	tocLabel?: string;
	kicker: string;
	title: string;
	lede: React.ReactNode;
	actions?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="mc-container mc-article">
			<aside className="mc-aside">
				<nav className="mc-aside-nav" aria-label={navLabel}>
					{groups.map((group) => (
						<div key={group.title} className="mc-aside-group">
							<p className="mc-kicker">{group.title}</p>
							<ul>
								{group.links.map((link) => (
									<li key={link.href}>
										<NextLink
											href={link.href}
											className="mc-aside-link"
											aria-current={link.href === current ? "page" : undefined}
										>
											{link.label}
										</NextLink>
									</li>
								))}
							</ul>
						</div>
					))}
					{toc && toc.length > 0 ? (
						<div className="mc-aside-group mc-aside-toc">
							<p className="mc-kicker">{tocLabel}</p>
							<ul>
								{toc.map((entry) => (
									<li key={entry.id}>
										<a
											href={`#${entry.id}`}
											className="mc-aside-link mc-aside-sub"
										>
											{entry.label}
										</a>
									</li>
								))}
							</ul>
						</div>
					) : null}
				</nav>
			</aside>
			<article className="mc-doc">
				<header className="mc-doc-head">
					<p className="mc-kicker">{kicker}</p>
					<h1 className="mc-display">{lines(title)}</h1>
					<div className="mc-doc-lede">{lede}</div>
					{actions}
				</header>
				<div className="mc-doc-body">{children}</div>
			</article>
		</div>
	);
}

export function ArticleSection({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mc-doc-section" id={id}>
			<h2>{title}</h2>
			{children}
		</section>
	);
}

export function Cards({
	columns = 2,
	children,
}: {
	columns?: 1 | 2;
	children: React.ReactNode;
}) {
	return <div className={`mc-cards mc-cards-${columns}`}>{children}</div>;
}

export function Card({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="mc-card">
			<h3>{title}</h3>
			<div className="mc-card-body">{children}</div>
		</div>
	);
}

export function Steps({ children }: { children: React.ReactNode }) {
	return <ol className="mc-steps">{children}</ol>;
}

export function Step({
	number,
	title,
	children,
}: {
	number: number;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<li className="mc-step">
			<span className="mc-step-number" aria-hidden="true">
				{number}
			</span>
			<div className="mc-step-body">
				<h3>{title}</h3>
				{children}
			</div>
		</li>
	);
}
