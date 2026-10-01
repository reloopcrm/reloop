import type { Metadata } from "next";
import NextLink from "next/link";
import { LandingShell } from "@/components/docs/landing-shell";
import { ProseHeading, ProsePage } from "@/components/site/prose";
import { getT } from "@/lib/i18n/server";
import { getImprint, IMPRINT_ROBOTS } from "@/lib/imprint";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Privacy"),
		description: t(
			"What this website collects, what a Reloop CRM install collects, and how to switch it off.",
		),
		robots: IMPRINT_ROBOTS,
	};
}

export default async function PrivacyPage() {
	const t = await getT();
	const imprint = getImprint();
	const controllerName = imprint
		? imprint.business
			? `${imprint.name}, ${imprint.business}`
			: imprint.name
		: t("the operator of this installation");
	const controllerAddress =
		imprint && imprint.addressLines.length > 0
			? imprint.addressLines.join(", ")
			: null;
	const controllerEmail = imprint?.email ?? null;

	return (
		<LandingShell>
			<ProsePage
				eyebrow={t("Legal")}
				title={t("Privacy")}
				lede={t(
					"This page covers two different things. The first is this website. The second is the Reloop CRM software that you install on your own server.",
				)}
			>
				<p>
					{t(
						"They are separate, and the difference matters: on your own server we hold none of your data.",
					)}
				</p>

				<ProseHeading>{t("Who is responsible")}</ProseHeading>

				<p>
					{t("The controller for this website is {controller}.", {
						controller: controllerName,
					})}
				</p>

				{controllerAddress ? (
					<p>
						{t("You can reach the controller by post at {address}.", {
							address: controllerAddress,
						})}
					</p>
				) : null}

				<p>
					{controllerEmail
						? t("Write to {email} with any question about your data.", {
								email: controllerEmail,
							})
						: t(
								"Use the contact page to reach the controller with any question about your data.",
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
						"The web server that serves these pages writes the usual server log for each request. That log is used to keep the site up and to find abuse.",
					)}
				</p>

				<p>
					{controllerEmail
						? t(
								"If you give us your email address to hear about the hosted version, we store that address and the date you gave it. We use it to tell you when the hosted version opens. Write to {email} to have it deleted.",
								{ email: controllerEmail },
							)
						: t(
								"If you give us your email address to hear about the hosted version, we store that address and the date you gave it. We use it to tell you when the hosted version opens. Use the contact page to have it deleted.",
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
						"This website uses only the processors needed to run it and its email signup. We sell no data and we share none for advertising.",
					)}
				</p>

				<ProseHeading>{t("Your rights")}</ProseHeading>

				<p>
					{controllerEmail
						? t(
								"You can ask what we hold about you, ask for a copy, ask for a correction and ask for deletion. You can object to a use and you can withdraw a consent you gave. Write to {email}. You can also complain to your national data protection authority.",
								{ email: controllerEmail },
							)
						: t(
								"You can ask what we hold about you, ask for a copy, ask for a correction and ask for deletion. You can object to a use and you can withdraw a consent you gave. Use the contact page to reach us. You can also complain to your national data protection authority.",
							)}
				</p>

				<p>
					{t(
						"This page reflects the current version of this website. A change to it is published here.",
					)}
				</p>

				<p>
					<NextLink href="/contact">{t("Contact")}</NextLink>
				</p>
			</ProsePage>
		</LandingShell>
	);
}
