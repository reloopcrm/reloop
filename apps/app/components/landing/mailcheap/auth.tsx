import Wordmark from "@crm/ui/components/wordmark";
import NextLink from "next/link";
import type * as React from "react";
import { Arrow } from "./marks";
import type { DraftLink } from "./shell";
import "./entwurf-mailcheap.css";

export function AuthSplit({
	home,
	title,
	intro,
	aside,
	children,
}: {
	home: DraftLink;
	title: string;
	intro: React.ReactNode;
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
					<NextLink
						href={home.href}
						className="mc-wordmark"
						aria-label={home.label}
					>
						<Wordmark aria-hidden="true" focusable="false" />
					</NextLink>
				</header>
				<main className="mc-auth-center">
					<div className="mc-auth-form mc-enter">
						<h1 className="mc-auth-title">{title}</h1>
						<div className="mc-auth-intro">{intro}</div>
						<div className="mc-auth-fields">{children}</div>
					</div>
				</main>
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

export function Field({
	id,
	label,
	type = "text",
	autoComplete,
	hint,
}: {
	id: string;
	label: string;
	type?: "text" | "email" | "password";
	autoComplete?: string;
	hint?: string;
}) {
	return (
		<div className="mc-field">
			<label htmlFor={id}>{label}</label>
			<input
				id={id}
				className="mc-input"
				type={type}
				autoComplete={autoComplete}
			/>
			{hint ? <span className="mc-field-hint">{hint}</span> : null}
		</div>
	);
}

export function SubmitButton({ label }: { label: string }) {
	return (
		<button type="submit" className="mc-btn mc-btn-lg mc-btn-block">
			{label}
			<Arrow />
		</button>
	);
}

export function AuthLine({ children }: { children: React.ReactNode }) {
	return <p className="mc-auth-line">{children}</p>;
}
