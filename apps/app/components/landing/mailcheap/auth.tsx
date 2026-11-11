import type * as React from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SiteHome, type SiteLink } from "./shell";
import "./mailcheap.css";

export function AuthSplit({
	home,
	aside,
	children,
}: {
	home: SiteLink;
	aside: {
		kicker: string;
		title: string;
		body: string;
		shot: React.ReactNode;
	};
	children: React.ReactNode;
}) {
	return (
		<div className="mc mc-auth">
			<div className="mc-auth-main">
				<header className="mc-auth-head">
					<SiteHome href={home.href} label={home.label} />
				</header>
				<main id="content" className="mc-auth-center">
					<div className="mc-auth-form mc-enter">{children}</div>
				</main>
				<footer className="mc-auth-foot">
					<LanguageSwitcher />
				</footer>
			</div>
			<aside className="mc-auth-aside" aria-hidden="true">
				<div className="mc-dots" />
				<div className="mc-auth-pitch">
					<p className="mc-kicker">{aside.kicker}</p>
					<h2 className="mc-display">{aside.title}</h2>
					<p className="mc-lede">{aside.body}</p>
				</div>
				<div className="mc-auth-shot">{aside.shot}</div>
			</aside>
		</div>
	);
}

export function AuthTitle({
	title,
	intro,
}: {
	title: React.ReactNode;
	intro: React.ReactNode;
}) {
	return (
		<div>
			<h1 className="mc-auth-title">{title}</h1>
			<div className="mc-auth-intro">{intro}</div>
		</div>
	);
}

export function AuthLine({ children }: { children: React.ReactNode }) {
	return <p className="mc-auth-line">{children}</p>;
}
