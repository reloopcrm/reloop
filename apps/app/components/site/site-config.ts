import Api from "@carbon/icons-react/es/Api";
import Code from "@carbon/icons-react/es/Code";
import Email from "@carbon/icons-react/es/Email";
import Search from "@carbon/icons-react/es/Search";
import Webhook from "@carbon/icons-react/es/Webhook";
import GmailLogo from "@crm/ui/components/brand-logos/gmail";
import GoogleCalendarLogo from "@crm/ui/components/brand-logos/google-calendar";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import SlackLogo from "@crm/ui/components/brand-logos/slack";
import type * as React from "react";
import type { Locale } from "@/lib/i18n/locale";

export type SiteMark = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export type Integration = { label: string; Mark: SiteMark };

export const INTEGRATIONS: readonly Integration[] = [
	{ label: "Gmail", Mark: GmailLogo },
	{ label: "Microsoft 365", Mark: MicrosoftLogo },
	{ label: "IMAP", Mark: Email },
	{ label: "Slack", Mark: SlackLogo },
	{ label: "Google Calendar", Mark: GoogleCalendarLogo },
	{ label: "Webhooks", Mark: Webhook },
	{ label: "REST intake API", Mark: Api },
	{ label: "Tracking script", Mark: Code },
	{ label: "Web research", Mark: Search },
];

export const MARQUEE_SETS = 3;

export const SHOTS = {
	path: "/site/shots",
	images: {
		"hero-overview": {
			width: 1600,
			height: 1000,
			alt: "Reloop overview: sidebar, KPIs, closed won chart and deals in progress",
		},
		"win-back": {
			width: 1600,
			height: 1000,
			alt: "Reloop Win back list: companies ranked by what happened in mail",
		},
		"contact-activity": {
			width: 1600,
			height: 1000,
			alt: "Reloop contact sheet with the conversation summary and mail timeline",
		},
		"follow-up-draft": {
			width: 1600,
			height: 1000,
			alt: "Reloop follow-up draft dialog over the Win back list",
		},
		contacts: { width: 1600, height: 1000, alt: "Reloop Contacts list" },
		companies: { width: 1600, height: 1000, alt: "Reloop Companies list" },
		"follow-up-dialog": {
			width: 1376,
			height: 1348,
			alt: "Reloop follow-up draft dialog with the change field",
		},
		"contact-record": {
			width: 1600,
			height: 1206,
			alt: "Reloop contact record with the summary and the mail timeline",
		},
		"overview-kpis": {
			width: 1600,
			height: 325,
			alt: "Reloop overview KPI cards",
		},
		"overview-chart": {
			width: 1376,
			height: 608,
			alt: "Reloop overview: closed won versus new pipeline chart",
		},
		"overview-deals": {
			width: 1600,
			height: 705,
			alt: "Reloop deals in progress",
		},
		"win-back-table": {
			width: 1600,
			height: 542,
			alt: "Reloop Win back table: companies ranked by potential",
		},
		"deals-pipeline": {
			width: 1600,
			height: 890,
			alt: "Reloop deals pipeline with three stages",
		},
		"win-back-compact": {
			width: 1600,
			height: 1138,
			alt: "Reloop Win back list, compact view",
		},
	},
	themes: ["light", "dark"],
} as const;

export type ShotName = keyof typeof SHOTS.images;

export type ShotTheme = (typeof SHOTS.themes)[number];

export function shotSrc(name: ShotName, theme: ShotTheme, locale: Locale) {
	const set = locale === "de" ? "/de" : "";
	return `${SHOTS.path}${set}/${name}-${theme}.webp`;
}
