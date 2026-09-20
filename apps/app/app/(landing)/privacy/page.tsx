import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";

export const metadata: Metadata = {
	title: "Privacy",
	description:
		"What this website collects, what a Reloop CRM install collects, and how to switch it off.",
};

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

export default function PrivacyPage() {
	return (
		<LandingShell>
			<main className="mx-auto flex w-full max-w-(--container-page) flex-1 flex-col gap-6 px-6 py-10">
				<h1 className="font-medium text-3xl tracking-tight">Privacy</h1>

				<p className="text-body-foreground text-sm/6">
					This page covers two different things. The first is this website. The
					second is the Reloop CRM software that you install on your own server.
					They are separate, and the difference matters: on your own server we
					hold none of your data.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					Who is responsible
				</h2>

				<p className="text-body-foreground text-sm/6">
					The controller for this website is {PLACEHOLDER.controller}, part of{" "}
					{PLACEHOLDER.entity}, {PLACEHOLDER.address}. Write to{" "}
					{PLACEHOLDER.email} with any question about your data.
				</p>

				<p className="text-body-foreground text-sm/6">
					When you run Reloop CRM on your own server, you are the controller of
					everything inside it. Your mailbox, your contacts and your deals never
					reach us.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					This website
				</h2>

				<p className="text-body-foreground text-sm/6">
					The public pages load no analytics. There is no autocapture, no
					session replay and no tracking script on this site.
				</p>

				<p className="text-body-foreground text-sm/6">
					The web server that serves these pages is run by {PLACEHOLDER.hosting}
					. It writes the usual server log for each request. That log is kept
					for {PLACEHOLDER.retention} and is used to keep the site up and to
					find abuse.
				</p>

				<p className="text-body-foreground text-sm/6">
					If you give us your email address to hear about the hosted version, we
					store that address and the date you gave it. We use it to tell you
					when the hosted version opens. Write to {PLACEHOLDER.email} to have it
					deleted.
				</p>

				<p className="text-body-foreground text-sm/6">
					Signing in sets a session cookie. That cookie keeps you signed in and
					is needed for the app to work. There is no advertising cookie. The
					fonts are served from this server, so no font service is called when
					you open a page.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					Your own Reloop CRM install
				</h2>

				<p className="text-body-foreground text-sm/6">
					Reloop CRM reads the mailbox you connect, over IMAP, Google Workspace
					or Microsoft 365. It stores the messages, the contacts and the
					companies in the Postgres database on your server. You choose how far
					back the first read goes. Nothing is copied anywhere else.
				</p>

				<p className="text-body-foreground text-sm/6">
					The AI parts run against an API key that you hold, from OpenRouter,
					OpenAI or Anthropic. The text of a conversation goes to the provider
					you picked, under your own contract with that provider. Without a key
					the CRM runs with the AI parts switched off, and no text leaves your
					server.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					What an install reports
				</h2>

				<p className="text-body-foreground text-sm/6">
					Reloop CRM can report one event a day about itself, plus a small
					number of setup events and one event for a failure. It sends them to
					the reporting project that you set up, not to us. No key means no
					client, and an install that sets none is silent. The event carries
					counts, never a value from a row. There is no contact name, no email
					address, no company domain and no deal amount in it.
				</p>

				<p className="text-body-foreground text-sm/6">
					The identifier is a single UUID made when your database was created.
					It is attached to nothing else. No IP address is sent, and the
					receiving project drops the address at ingestion. An allowlist in the
					source code names every property that may be sent, and anything else
					is dropped before the event is built.
				</p>

				<p className="text-body-foreground text-sm/6">
					Set CRM_TELEMETRY_DISABLED to 1 or DO_NOT_TRACK to 1 in your .env
					file, then restart. Nothing is sent after that. An install that never
					sets a reporting key sends nothing at all.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					Who else sees it
				</h2>

				<p className="text-body-foreground text-sm/6">
					For this website: {PLACEHOLDER.processors}. We sell no data and we
					share none for advertising.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					Your rights
				</h2>

				<p className="text-body-foreground text-sm/6">
					You can ask what we hold about you, ask for a copy, ask for a
					correction and ask for deletion. You can object to a use and you can
					withdraw a consent you gave. Write to {PLACEHOLDER.email}. You can
					also complain to {PLACEHOLDER.authority}.
				</p>

				<p className="text-body-foreground text-sm/6">
					This page is valid from {PLACEHOLDER.effectiveDate}. A change to it is
					published here.
				</p>

				<p className="text-muted-foreground text-sm/6">
					<Link variant="quiet" href="/contact">
						Contact
					</Link>
				</p>

				<p className="text-muted-foreground text-sm/6">
					<Link variant="quiet" href="/">
						Back to the start page
					</Link>
				</p>
			</main>
		</LandingShell>
	);
}
