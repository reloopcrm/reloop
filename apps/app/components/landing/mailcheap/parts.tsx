import { AddIcon } from "@crm/ui/components/line-icons";
import NextLink from "next/link";
import type * as React from "react";
import { CopyButton } from "./copy-button";
import { Arrow } from "./marks";
import type { DraftLink } from "./shell";

function lines(title: string): React.ReactNode {
	const parts = title.split("\n");
	if (parts.length === 1) return title;
	return parts.map((line) => (
		<span key={line} className="mc-line">
			{line}
		</span>
	));
}

export function Actions({
	primary,
	secondary,
	large = false,
}: {
	primary: DraftLink;
	secondary?: DraftLink;
	large?: boolean;
}) {
	return (
		<div className="mc-actions">
			<NextLink
				href={primary.href}
				className={large ? "mc-btn mc-btn-lg" : "mc-btn"}
				target={primary.external ? "_blank" : undefined}
				rel={primary.external ? "noreferrer" : undefined}
			>
				{primary.label}
				<Arrow />
			</NextLink>
			{secondary ? (
				<NextLink
					href={secondary.href}
					className="mc-link"
					target={secondary.external ? "_blank" : undefined}
					rel={secondary.external ? "noreferrer" : undefined}
				>
					{secondary.label}
				</NextLink>
			) : null}
		</div>
	);
}

export function PageHero({
	kicker,
	title,
	lede,
	primary,
	secondary,
	note,
	children,
}: {
	kicker?: React.ReactNode;
	title: string;
	lede: React.ReactNode;
	primary?: DraftLink;
	secondary?: DraftLink;
	note?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<section className="mc-hero">
			<div className="mc-dots" aria-hidden="true" />
			<div className="mc-container mc-hero-inner mc-page-hero">
				{kicker ? <p className="mc-kicker-line">{kicker}</p> : null}
				<h1 className="mc-h1 mc-page-h1">{lines(title)}</h1>
				<div className="mc-lede">{lede}</div>
				{primary ? (
					<Actions primary={primary} secondary={secondary} large />
				) : null}
				{note ? <p className="mc-hero-note">{note}</p> : null}
				{children ? <div className="mc-hero-shot">{children}</div> : null}
			</div>
		</section>
	);
}

export function SectionHead({
	kicker,
	title,
	lede,
	start = false,
}: {
	kicker?: string;
	title: string;
	lede?: React.ReactNode;
	start?: boolean;
}) {
	return (
		<header className={start ? "mc-section-head mc-start" : "mc-section-head"}>
			{kicker ? <p className="mc-kicker">{kicker}</p> : null}
			<h2 className="mc-display">{title}</h2>
			{lede ? <div className="mc-lede">{lede}</div> : null}
		</header>
	);
}

export function Section({
	id,
	children,
}: {
	id?: string;
	children: React.ReactNode;
}) {
	return (
		<section id={id} className="mc-section">
			<div className="mc-container">{children}</div>
		</section>
	);
}

export function Split({
	title,
	kicker,
	lede,
	actions,
	children,
	media,
}: {
	title: string;
	kicker?: string;
	lede?: React.ReactNode;
	actions?: React.ReactNode;
	children?: React.ReactNode;
	media?: React.ReactNode;
}) {
	return (
		<div className={media ? "mc-split" : "mc-split mc-split-text"}>
			<div className="mc-split-copy">
				{kicker ? <p className="mc-kicker">{kicker}</p> : null}
				<h2 className="mc-display">{title}</h2>
				{lede ? <div className="mc-prose mc-prose-lede">{lede}</div> : null}
				{children}
				{actions}
			</div>
			{media ? <div className="mc-split-media">{media}</div> : null}
		</div>
	);
}

export function Tiles({
	columns,
	children,
}: {
	columns: 2 | 3 | 4;
	children: React.ReactNode;
}) {
	return <div className={`mc-tiles mc-tiles-${columns}`}>{children}</div>;
}

export function TextTile({
	title,
	body,
	index,
	children,
}: {
	title: string;
	body: React.ReactNode;
	index?: number;
	children?: React.ReactNode;
}) {
	return (
		<article className="mc-tile mc-tile-text">
			{index !== undefined ? (
				<span className="mc-tile-index" aria-hidden="true">
					{index}
				</span>
			) : null}
			<h3>{title}</h3>
			<div className="mc-desc">{body}</div>
			{children}
		</article>
	);
}

export type FaqEntry = {
	question: string;
	answer: React.ReactNode;
	detail?: React.ReactNode;
};

export function Question({
	question,
	children,
}: {
	question: string;
	children: React.ReactNode;
}) {
	return (
		<details>
			<summary>
				{question}
				<AddIcon aria-hidden="true" className="mc-faq-icon" />
			</summary>
			<div className="mc-answer">{children}</div>
		</details>
	);
}

export function Faq({
	id,
	title,
	items,
}: {
	id: string;
	title: string;
	items: readonly FaqEntry[];
}) {
	return (
		<section className="mc-section" id={id}>
			<div className="mc-container mc-faq">
				<header>
					<h2 className="mc-display">{title}</h2>
				</header>
				<div className="mc-faq-list">
					{items.map((item) => (
						<Question key={item.question} question={item.question}>
							<p>{item.answer}</p>
							{item.detail}
						</Question>
					))}
				</div>
			</div>
		</section>
	);
}

export function Closing({
	title,
	lede,
	primary,
	secondary,
	children,
}: {
	title: string;
	lede?: React.ReactNode;
	primary: DraftLink;
	secondary?: DraftLink;
	children?: React.ReactNode;
}) {
	return (
		<section className="mc-closing">
			<div className="mc-dots" aria-hidden="true" />
			<div className="mc-container mc-closing-inner">
				<h2>{title}</h2>
				{lede ? <p className="mc-lede">{lede}</p> : null}
				<Actions primary={primary} secondary={secondary} large />
				{children ? <div className="mc-closing-shot">{children}</div> : null}
			</div>
		</section>
	);
}

export function CodeFigure({
	code,
	caption,
	labels,
}: {
	code: string;
	caption: string;
	labels: { copy: string; copied: string };
}) {
	return (
		<figure className="mc-code">
			<figcaption>
				<span>{caption}</span>
				<CopyButton text={code} labels={labels} />
			</figcaption>
			<pre>
				<code>{code}</code>
			</pre>
		</figure>
	);
}

export function Note({ children }: { children: React.ReactNode }) {
	return <p className="mc-more">{children}</p>;
}
