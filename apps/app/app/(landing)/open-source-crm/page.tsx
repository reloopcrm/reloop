import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { BentoCard, CardHeading } from "@/components/landing/bento-card";
import { Faq } from "@/components/landing/faq";
import { LandingShell } from "@/components/landing/landing-shell";
import {
	CardGrid,
	ClosingCta,
	CloudBanner,
	PageHero,
	PageSection,
	Prose,
} from "@/components/landing/page-blocks";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("What an open source CRM gives you"),
		description: t(
			"An open source CRM lets you read the code, run it on your server and keep your data. What that buys you, where it stops, and where Reloop CRM fits.",
		),
	};
}

export default async function OpenSourceCrmPage() {
	const t = await getT();

	const gains = [
		{
			title: t("The data stays on your server"),
			body: t(
				"Your customer list lives in a Postgres database you can open, dump and move. There is no export button with a row limit.",
			),
		},
		{
			title: t("No price change you did not agree to"),
			body: t(
				"A hosted CRM can raise the price per seat or retire the plan you are on. The version you run today runs at the same cost tomorrow.",
			),
		},
		{
			title: t("You can read what it does with your mail"),
			body: t(
				"With a hosted product you trust a privacy page. Here, you or someone you hire reads the code that touches each message.",
			),
		},
		{
			title: t("It outlives the company behind it"),
			body: t(
				"If the maintainers stop, the code stays public and anyone can fork it. A hosted CRM that shuts down gives you a deadline.",
			),
		},
	];

	const faq = [
		{
			question: t("Is an open source CRM really free?"),
			answer: t(
				"The software is. The licence fee is zero for any number of users. You pay for the server it runs on and for optional AI credits.",
			),
		},
		{
			question: t("Do I have to publish my changes?"),
			answer: t(
				"Only if you change the code and give the changed version to other people over a network. Running it inside your own company creates no duty to publish.",
			),
		},
		{
			question: t("Can I move my data out later?"),
			answer: t(
				"Yes. Everything sits in one Postgres database on your server. A pg_dump gives you a complete copy in one file.",
			),
		},
	];

	return (
		<LandingShell>
			<PageHero
				title={t("An open source CRM is one you can read, run and keep")}
				lede={t(
					"The code is public, the licence lets you run it on your own server, and nobody can switch it off. Here is what that buys you and where it stops.",
				)}
				actions={null}
			/>

			<CloudBanner />

			<PageSection title={t("What the licence says")} tone="secondary">
				<Prose>
					<p>
						{t(
							"Reloop CRM uses the GNU Affero General Public License, version 3. You run it for any purpose and for any number of users, without a licence fee. If you change the code and offer the changed version to other people over a network, you publish your changes under the same licence. Using it inside your own company creates no such duty.",
						)}{" "}
						<Link href="/open-source">
							{t("The full text is on the open source page.")}
						</Link>{" "}
						{t("That text is the source, not this summary.")}
					</p>
					<p>
						{t(
							"Open source is not the same as free of cost. Someone still pays for the server, the backups and the hours. The difference is who decides.",
						)}
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title={t("What it gives you that a hosted CRM does not")}
				lede={t(
					"Four things you get from the licence, not from a feature list.",
				)}
			>
				<CardGrid>
					{gains.map((gain) => (
						<BentoCard key={gain.title}>
							<CardHeading title={gain.title} body={gain.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection title={t("Where the limits are")} tone="secondary">
				<Prose>
					<p>
						{t(
							"Nobody runs it for you. You need a server, a domain and a person who is comfortable with a terminal for one afternoon. Updates are your job too.",
						)}{" "}
						<Link href="/self-hosted-crm">
							{t(
								"The self-hosted CRM page lists what that takes in money and time.",
							)}
						</Link>
					</p>
					<p>
						{t(
							"Support is the issue tracker, not a phone number, and the ecosystem is smaller than a large hosted CRM's.",
						)}{" "}
						<Link href="/vs/hubspot">
							{t("The comparison with HubSpot spells that out.")}
						</Link>
					</p>
				</Prose>
			</PageSection>

			<PageSection title={t("Where Reloop CRM fits")}>
				<Prose>
					<p>
						{t(
							"Reloop CRM is for a small sales team that already has years of email. It connects to Gmail, Microsoft 365 or any IMAP mailbox, reads the history once, and builds companies, contacts and deals from real conversations. Then it tells you which past customers went quiet and why they are worth a new call.",
						)}{" "}
						<Link href="/win-back-customers">
							{t(
								"The page on winning back customers shows how that works day to day.",
							)}
						</Link>
					</p>
					<p>
						{t(
							"The honest limits: it sends no email campaigns and no sequences, and there is no mobile app. It is a young project, so read the changelog before an update.",
						)}
					</p>
				</Prose>
			</PageSection>

			<Faq id="open-source-crm-faq" items={faq} tone="secondary" />

			<ClosingCta
				title={t("Read the code. Run it. Keep it.")}
				secondary={{
					href: "/self-hosted-crm",
					label: t("What self-hosting takes"),
				}}
			/>
		</LandingShell>
	);
}
