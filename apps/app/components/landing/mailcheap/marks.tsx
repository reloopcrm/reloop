import GmailLogo from "@crm/ui/components/brand-logos/gmail";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { MailIcon, OpenIcon } from "@crm/ui/components/line-icons";
import type * as React from "react";
import type { SiteMark } from "@/components/site/site-config";
import type { CycleMark } from "./config";

export function Arrow() {
	return <OpenIcon aria-hidden="true" strokeWidth={2} className="mc-arrow" />;
}

export function ImapMark(props: React.SVGProps<SVGSVGElement>) {
	return <MailIcon aria-hidden="true" strokeWidth={1.8} {...props} />;
}

export function GoogleMark(props: React.SVGProps<SVGSVGElement>) {
	return <GoogleLogo {...props} />;
}

export function MicrosoftMark(props: React.SVGProps<SVGSVGElement>) {
	return <MicrosoftLogo {...props} />;
}

const TILE = {
	gmail: {
		fill: "#ffffff",
		Logo: GmailLogo,
		x: 6,
		y: 8.5,
		width: 20,
		height: 15,
	},
	microsoft: {
		fill: "#ffffff",
		Logo: MicrosoftLogo,
		x: 7.5,
		y: 7.5,
		width: 17,
		height: 17,
	},
	imap: {
		fill: "var(--mc-muted)",
		Logo: ImapMark,
		x: 7,
		y: 7,
		width: 18,
		height: 18,
	},
} as const satisfies Record<
	CycleMark,
	{
		fill: string;
		Logo: React.ComponentType<React.SVGProps<SVGSVGElement>>;
		x: number;
		y: number;
		width: number;
		height: number;
	}
>;

export function BrandTile({ mark }: { mark: CycleMark }) {
	const { fill, Logo, x, y, width, height } = TILE[mark];
	return (
		<svg viewBox="0 0 32 32" aria-hidden="true" className="mc-brand-tile">
			<rect
				width="32"
				height="32"
				rx="8"
				fill={fill}
				stroke={mark === "imap" ? "var(--mc-border-strong)" : undefined}
			/>
			<Logo
				x={x}
				y={y}
				width={width}
				height={height}
				color={mark === "imap" ? "var(--mc-fg)" : undefined}
			/>
		</svg>
	);
}

export function InlineMark({ Mark, name }: { Mark: SiteMark; name: string }) {
	return (
		<span className="mc-inline-mark">
			<Mark aria-hidden="true" />
			{name}
		</span>
	);
}
