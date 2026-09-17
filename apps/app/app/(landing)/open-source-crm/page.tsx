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
		body: "Your customer list lives in a Postgres database you can open, dump and move. There is no export button with a row limit and no support ticket to get your own data back.",
	},
	{
		title: "No price change you did not agree to",
		body: "A hosted CRM can raise the price per seat, move a feature to a higher plan or retire the plan you are on. The open source version you run today runs at the same cost tomorrow.",
	},
	{
		title: "You can read what it does with your mail",
		body: "Reloop CRM reads your mailbox history. With a hosted product you trust a privacy page. With open source, you or someone you hire can read the code that touches each message.",
	},
	{
		title: "It outlives the company behind it",
		body: "If the maintainers stop, the code stays public and anyone can fork it. A hosted CRM that shuts down gives you a deadline and an export file.",
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
	{
		question: "Does Reloop CRM work without AI?",
		answer:
			"Yes. Without an API key it is a normal CRM with clean contacts, companies and deals. The summaries and the win back scores need a key.",
	},
] as const;

export default function OpenSourceCrmPage() {
	return (
		<LandingShell>
			<PageHero
				title="An open source CRM is one you can read, run and keep"
				lede="The code is public, the licence lets you run it on your own server, and nobody can switch it off. Here is what that buys you, where it stops, and where Reloop CRM fits."
			/>

			<PageSection title="What open source means for a CRM">
				<Prose>
					<p>
						An open source CRM publishes its source code under a licence that
						lets you read it, run it, change it and pass it on. For a CRM that
						matters more than for most software, because the database holds the
						one thing your company cannot rebuild from memory: every customer,
						every quote, and every reason someone stopped ordering.
					</p>
					<p>
						The licence is the part people skip. Reloop CRM uses the GNU Affero
						General Public License, version 3. You can run it for any purpose,
						for any number of users, without a licence fee. If you change the
						code and offer the changed version to other people over a network,
						you publish your changes under the same licence. Using it inside
						your own company creates no such duty. The full licence text is on
						the <Link href="/open-source">open source page</Link>, and it is the
						source, not this summary.
					</p>
					<p>
						Open source is not the same as free of cost. Someone still pays for
						the server, the backups and the hours. The difference is who
						decides. You pay for what you use, at the price of the provider you
						choose, and the bill for the software itself stays at zero.
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
						is comfortable with a terminal for one afternoon. The{" "}
						<Link href="/self-hosted-crm">self-hosted CRM page</Link> lists what
						that takes in money and time.
					</p>
					<p>
						Support is the community and the issue tracker, not a phone number.
						An answer comes when a maintainer or another user has time. A
						company that needs a support contract with a response time is better
						served by a commercial product.
					</p>
					<p>
						The ecosystem is smaller. A large hosted CRM has years of
						integrations, agencies and training material behind it. An open
						source CRM has what its contributors have built, and that is less.
						The <Link href="/vs/hubspot">comparison with HubSpot</Link> spells
						this out.
					</p>
					<p>
						Updates are your job. Docker Compose makes an update two commands,
						but nobody presses the button for you, and nobody reads the
						changelog for you either.
					</p>
				</Prose>
			</PageSection>

			<PageSection title="Where Reloop CRM fits">
				<Prose>
					<p>
						Reloop CRM is an open source CRM for a small sales team that already
						has years of email. It connects to Gmail, Microsoft 365 or any IMAP
						mailbox, reads the history once over IMAP, and builds companies,
						contacts and deals from real conversations. Then it tells you which
						past customers went quiet and why they are worth a new call. It
						started inside a{" "}
						<Link href="/for/freight-forwarding">freight forwarding</Link>{" "}
						company, and that is still the clearest example of the job it does.
					</p>
					<p>
						The AI part is optional. Bring an OpenRouter, OpenAI or Anthropic
						key and the agent summarises threads and ranks the win back list.
						Without a key it is a normal CRM with clean contacts and a deal
						board.
					</p>
					<p>
						The honest limits: Reloop CRM does not send email campaigns or
						sequences. There is no mobile app. The hosted version is not open
						yet. It is derived from the open source CRM by Comp AI and it is a
						young project, so expect rough edges and read the changelog before
						an update.
					</p>
					<p>
						To try it,{" "}
						<Link href="/get-started">install it on your own server</Link> with
						one command, then read the <Link href="/docs">docs</Link> for the
						mailbox and AI setup.
					</p>
				</Prose>
			</PageSection>

			<Faq id="open-source-crm-faq" items={FAQ} />

			<ClosingCta
				title="Read the code. Run it. Keep it."
				links={[
					{ href: "/get-started", label: "Get started" },
					{ href: "/self-hosted-crm", label: "What self-hosting takes" },
					{ href: "/vs/hubspot", label: "Compare with HubSpot" },
				]}
			/>
		</LandingShell>
	);
}
