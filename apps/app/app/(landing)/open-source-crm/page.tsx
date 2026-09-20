import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { BentoCard, CardHeading } from "@/components/landing/bento-card";
import { Faq } from "@/components/landing/faq";
import { LandingShell } from "@/components/landing/landing-shell";
import {
	CardGrid,
	ClosingCta,
	PageHero,
	PageSection,
	Prose,
} from "@/components/landing/page-blocks";

export const metadata: Metadata = {
	title: "What an open source CRM gives you",
	description:
		"An open source CRM lets you read the code, run it on your server and keep your data. What that buys you, where it stops, and where Reloop CRM fits.",
};

const GAINS = [
	{
		title: "The data stays on your server",
		body: "Your customer list lives in a Postgres database you can open, dump and move. There is no export button with a row limit.",
	},
	{
		title: "No price change you did not agree to",
		body: "A hosted CRM can raise the price per seat or retire the plan you are on. The version you run today runs at the same cost tomorrow.",
	},
	{
		title: "You can read what it does with your mail",
		body: "With a hosted product you trust a privacy page. Here, you or someone you hire reads the code that touches each message.",
	},
	{
		title: "It outlives the company behind it",
		body: "If the maintainers stop, the code stays public and anyone can fork it. A hosted CRM that shuts down gives you a deadline.",
	},
] as const;

const FAQ = [
	{
		question: "Is an open source CRM really free?",
		answer:
			"The software is. The licence fee is zero for any number of users. You pay for the server it runs on and for optional AI credits.",
	},
	{
		question: "Do I have to publish my changes?",
		answer:
			"Only if you change the code and give the changed version to other people over a network. Running it inside your own company creates no duty to publish.",
	},
	{
		question: "Can I move my data out later?",
		answer:
			"Yes. Everything sits in one Postgres database on your server. A pg_dump gives you a complete copy in one file.",
	},
] as const;

export default function OpenSourceCrmPage() {
	return (
		<LandingShell>
			<PageHero
				title="An open source CRM is one you can read, run and keep"
				lede="The code is public, the licence lets you run it on your own server, and nobody can switch it off. Here is what that buys you and where it stops."
			/>

			<PageSection title="What the licence says">
				<Prose>
					<p>
						Reloop CRM uses the GNU Affero General Public License, version 3.
						You run it for any purpose and for any number of users, without a
						licence fee. If you change the code and offer the changed version to
						other people over a network, you publish your changes under the same
						licence. Using it inside your own company creates no such duty. The
						full text is on the{" "}
						<Link href="/open-source">open source page</Link>, and that text is
						the source, not this summary.
					</p>
					<p>
						Open source is not the same as free of cost. Someone still pays for
						the server, the backups and the hours. The difference is who
						decides.
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title="What it gives you that a hosted CRM does not"
				lede="Four things you get from the licence, not from a feature list."
			>
				<CardGrid>
					{GAINS.map((gain) => (
						<BentoCard key={gain.title}>
							<CardHeading title={gain.title} body={gain.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection title="Where the limits are">
				<Prose>
					<p>
						Nobody runs it for you. You need a server, a domain and a person who
						is comfortable with a terminal for one afternoon. Updates are your
						job too. The{" "}
						<Link href="/self-hosted-crm">self-hosted CRM page</Link> lists what
						that takes in money and time.
					</p>
					<p>
						Support is the issue tracker, not a phone number, and the ecosystem
						is smaller than a large hosted CRM's. The{" "}
						<Link href="/vs/hubspot">comparison with HubSpot</Link> spells that
						out.
					</p>
				</Prose>
			</PageSection>

			<PageSection title="Where Reloop CRM fits">
				<Prose>
					<p>
						Reloop CRM is for a small sales team that already has years of
						email. It connects to Gmail, Microsoft 365 or any IMAP mailbox,
						reads the history once, and builds companies, contacts and deals
						from real conversations. Then it tells you which past customers went
						quiet and why they are worth a new call. It started inside a{" "}
						<Link href="/for/freight-forwarding">freight forwarding</Link>{" "}
						company, and that is still the clearest example of the job it does.
					</p>
					<p>
						The honest limits: it sends no email campaigns and no sequences,
						there is no mobile app, and the hosted version is not open yet. It
						is a young project, so read the changelog before an update.
					</p>
				</Prose>
			</PageSection>

			<Faq id="open-source-crm-faq" items={FAQ} />

			<ClosingCta
				title="Read the code. Run it. Keep it."
				links={[
					{ href: "/get-started", label: "Get started" },
					{ href: "/self-hosted-crm", label: "What self-hosting takes" },
				]}
			/>
		</LandingShell>
	);
}
