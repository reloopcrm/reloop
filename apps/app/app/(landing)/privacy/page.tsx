import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";
import {
	Band,
	PageHero,
	Prose,
	ProseHeading,
} from "@/components/landing/page-blocks";
import { getT } from "@/lib/i18n/server";

const PLACEHOLDER = {
	entity: "{{LEGAL_ENTITY}}",
	controller: "{{DATA_CONTROLLER}}",
	address: "{{POSTAL_ADDRESS}}",
	email: "{{PRIVACY_EMAIL}}",
	hosting: "{{HOSTING_PROVIDER}}",
	processors: "{{PROCESSORS}}",
	retention: "{{RETENTION_PERIOD}}",
	authority: "{{SUPERVISORY_AUTHORITY}}",
	effectiveDate: "{{EFFECTIVE_DATE}}",
} as const;

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Privacy"),
		description: t(
			"What this website collects, what a Reloop CRM install collects, and how to switch it off.",
		),
	};
}

export default async function PrivacyPage() {
	const t = await getT();

	return (
		<LandingShell>
			<PageHero
				title={t("Privacy")}
				size="title"
				lede={t(
					"This page covers two different things. The first is this website. The second is the Reloop CRM software that you install on your own server.",
				)}
				actions={null}
			/>

			<Band tone="secondary">
				<Prose>
					<p>
						{t(
							"They are separate, and the difference matters: on your own server we hold none of your data.",
						)}
					</p>

					<ProseHeading>{t("Who is responsible")}</ProseHeading>

					<p>
						{t(
							"The controller for this website is {controller}, part of {entity}, {address}. Write to {email} with any question about your data.",
							{
								controller: PLACEHOLDER.controller,
								entity: PLACEHOLDER.entity,
								address: PLACEHOLDER.address,
								email: PLACEHOLDER.email,
							},
						)}
					</p>

					<p>
						{t(
							"When you run Reloop CRM on your own server, you are the controller of everything inside it. Your mailbox, your contacts and your deals never reach us.",
						)}
					</p>

					<ProseHeading>{t("This website")}</ProseHeading>

					<p>
						{t(
							"The public pages load no analytics. There is no autocapture, no session replay and no tracking script on this site.",
						)}
					</p>

					<p>
						{t(
							"The web server that serves these pages is run by {hosting}. It writes the usual server log for each request. That log is kept for {retention} and is used to keep the site up and to find abuse.",
							{
								hosting: PLACEHOLDER.hosting,
								retention: PLACEHOLDER.retention,
							},
						)}
					</p>

					<p>
						{t(
							"If you give us your email address to hear about the hosted version, we store that address and the date you gave it. We use it to tell you when the hosted version opens. Write to {email} to have it deleted.",
							{ email: PLACEHOLDER.email },
						)}
					</p>

					<p>
						{t(
							"Signing in sets a session cookie. That cookie keeps you signed in and is needed for the app to work. There is no advertising cookie. The fonts are served from this server, so no font service is called when you open a page.",
						)}
					</p>

					<ProseHeading>{t("Your own Reloop CRM install")}</ProseHeading>

					<p>
						{t(
							"Reloop CRM reads the mailbox you connect, over IMAP, Google Workspace or Microsoft 365. It stores the messages, the contacts and the companies in the Postgres database on your server. You choose how far back the first read goes. Nothing is copied anywhere else.",
						)}
					</p>

					<p>
						{t(
							"The AI parts run against an API key that you hold, from OpenRouter, OpenAI or Anthropic. The text of a conversation goes to the provider you picked, under your own contract with that provider. Without a key the CRM runs with the AI parts switched off, and no text leaves your server.",
						)}
					</p>

					<ProseHeading>{t("What an install reports")}</ProseHeading>

					<p>
						{t(
							"Reloop CRM can report one event a day about itself, plus a small number of setup events and one event for a failure. It sends them to the reporting project that you set up, not to us. No key means no client, and an install that sets none is silent. The event carries counts, never a value from a row. There is no contact name, no email address, no company domain and no deal amount in it.",
						)}
					</p>

					<p>
						{t(
							"The identifier is a single UUID made when your database was created. It is attached to nothing else. No IP address is sent, and the receiving project drops the address at ingestion. An allowlist in the source code names every property that may be sent, and anything else is dropped before the event is built.",
						)}
					</p>

					<p>
						{t(
							"Set CRM_TELEMETRY_DISABLED to 1 or DO_NOT_TRACK to 1 in your .env file, then restart. Nothing is sent after that. An install that never sets a reporting key sends nothing at all.",
						)}
					</p>

					<ProseHeading>{t("Who else sees it")}</ProseHeading>

					<p>
						{t(
							"For this website: {processors}. We sell no data and we share none for advertising.",
							{ processors: PLACEHOLDER.processors },
						)}
					</p>

					<ProseHeading>{t("Your rights")}</ProseHeading>

					<p>
						{t(
							"You can ask what we hold about you, ask for a copy, ask for a correction and ask for deletion. You can object to a use and you can withdraw a consent you gave. Write to {email}. You can also complain to {authority}.",
							{ email: PLACEHOLDER.email, authority: PLACEHOLDER.authority },
						)}
					</p>

					<p>
						{t(
							"This page is valid from {date}. A change to it is published here.",
							{ date: PLACEHOLDER.effectiveDate },
						)}
					</p>

					<p className="text-muted-foreground text-sm/6">
						<Link variant="quiet" href="/contact">
							{t("Contact")}
						</Link>
					</p>
				</Prose>
			</Band>
		</LandingShell>
	);
}
