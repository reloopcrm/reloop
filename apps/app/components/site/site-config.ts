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
