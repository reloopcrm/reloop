import { MenuIcon } from "@crm/ui/components/line-icons";
import Wordmark from "@crm/ui/components/wordmark";
import NextLink from "next/link";
import type * as React from "react";

export type DraftLink = { href: string; label: string; external?: boolean };

export type FooterGroup = { title: string; links: readonly DraftLink[] };

function Anchor({ link, className }: { link: DraftLink; className?: string }) {
	return (
		<NextLink
			href={link.href}
			className={className}
			target={link.external ? "_blank" : undefined}
			rel={link.external ? "noreferrer" : undefined}
		>
			{link.label}
		</NextLink>
	);
}

function Home({ href, label }: { href: string; label: string }) {
	return (
		<NextLink href={href} className="mc-wordmark" aria-label={label}>
			<Wordmark aria-hidden="true" focusable="false" />
		</NextLink>
	);
}

export function DraftHeader({
	home,
	links,
	start,
	menu,
	navLabel,
}: {
	home: DraftLink;
	links: readonly DraftLink[];
	start: DraftLink;
	menu: string;
	navLabel: string;
}) {
	return (
		<header className="mc-header">
			<div className="mc-container">
				<Home href={home.href} label={home.label} />
				<nav className="mc-nav" aria-label={navLabel}>
					<span className="mc-nav-links">
						{links.map((link) => (
							<Anchor
								key={link.href}
								link={link}
								className="mc-btn mc-btn-sm mc-btn-ghost"
							/>
						))}
					</span>
					<Anchor link={start} className="mc-btn mc-btn-sm ml-1.5" />
					<details className="mc-menu">
						<summary className="mc-menu-button" aria-label={menu}>
							<MenuIcon aria-hidden="true" />
						</summary>
						<ul className="mc-menu-list">
							{links.map((link) => (
								<li key={link.href}>
									<Anchor link={link} className="mc-menu-link" />
								</li>
							))}
						</ul>
					</details>
				</nav>
			</div>
		</header>
	);
}

export function DraftFooter({
	home,
	tagline,
	note,
	groups,
	navLabel,
	legal,
}: {
	home: DraftLink;
	tagline: string;
	note?: React.ReactNode;
	groups: readonly FooterGroup[];
	navLabel: string;
	legal: string;
}) {
	return (
		<footer className="mc-footer">
			<div className="mc-container">
				<div className="mc-foot-grid">
					<div className="mc-foot-brand">
						<Home href={home.href} label={home.label} />
						<p className="mc-tag">{tagline}</p>
						{note ? <p className="mc-note">{note}</p> : null}
					</div>
					<nav className="mc-foot-cols" aria-label={navLabel}>
						{groups.map((group) => (
							<div key={group.title}>
								<p className="mc-kicker">{group.title}</p>
								<ul>
									{group.links.map((link) => (
										<li key={link.href}>
											<Anchor link={link} className="mc-foot-link" />
										</li>
									))}
								</ul>
							</div>
						))}
					</nav>
				</div>
				<div className="mc-foot-bottom">
					<p>{legal}</p>
				</div>
			</div>
		</footer>
	);
}
