import Locked from "@carbon/icons-react/es/Locked";
import type * as React from "react";

export function BrowserBar({ url }: { url: string }) {
	return (
		<div className="mc-browser-bar">
			<div className="mc-lights" aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
			<span className="mc-url">
				<Locked aria-hidden="true" />
				{url}
			</span>
			<span />
		</div>
	);
}

export function BrowserFrame({
	url,
	children,
}: {
	url: string;
	children: React.ReactNode;
}) {
	return (
		<div className="mc-browser">
			<BrowserBar url={url} />
			{children}
		</div>
	);
}
