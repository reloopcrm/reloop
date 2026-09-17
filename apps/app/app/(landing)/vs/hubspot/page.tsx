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
import { HUBSPOT_PRICING_URL } from "@/components/landing/site";

export const metadata: Metadata = {
	title: "Reloop vs HubSpot: a fair comparison",
	description:
		"HubSpot is a hosted commercial CRM with a large platform. Reloop CRM is open source on your own server. What each does better, with no invented numbers.",
};

const HUBSPOT_WINS = [
	{
		title: "A large ecosystem",
		body: "HubSpot has years of integrations, agencies and training material behind it. Reloop CRM has what its contributors have built, and that is far less.",
	},
	{
		title: "Marketing automation",
		body: "Marketing automation is part of HubSpot. Reloop CRM does not send campaigns or sequences. It reads mail and ranks customers, and that is the whole job.",
	},
	{
		title: "Support",
		body: "HubSpot has a support organisation. Reloop CRM has a GitHub issue tracker and the docs. An answer comes when a maintainer or another user has time.",
	},
	{
		title: "No server to run",
		body: "HubSpot runs the servers, the updates and the backups. With Reloop CRM those are yours, which is the price of keeping the data in-house.",
	},
] as const;

const RELOOP_WINS = [
	{
		title: "Your data stays on your disk",
		body: "One Postgres database on your own server. Read it, dump it, move it. There is no export limit and no support ticket to get your own data back.",
	},
	{
		title: "You can read the code",
		body: "The whole product is public under the AGPL. The code that reads your mail is there for anyone to check, line by line.",
	},
	{
		title: "No per seat price",
		body: "The licence fee is zero for any number of users. The server bill does not change when the whole team signs in.",
	},
	{
		title: "Built around your mailbox",
		body: "Reloop CRM starts from years of email and builds companies, contacts and deals out of real conversations, so the first day already shows what happened with each customer.",
	},
] as const;

const FAQ = [
	{
		question: "Is Reloop CRM a replacement for HubSpot?",
		answer:
			"For a small sales team that lives in email, yes for the CRM part. For marketing automation, no. Reloop CRM does not send campaigns or sequences.",
	},
	{
		question: "Can I move from HubSpot to Reloop CRM?",
		answer:
			"Reloop CRM builds contacts and companies from your mailbox, so the history comes along with the mail. There is no HubSpot import. A contact that exists only in HubSpot needs a manual step.",
	},
	{
		question: "What does Reloop CRM cost compared with HubSpot?",
		answer:
			"Reloop CRM has no licence fee. You pay for a server and for optional AI credits. For HubSpot's prices and plans, read HubSpot's own pricing page. This page does not repeat them.",
	},
	{
		question: "Does Reloop CRM have support?",
		answer:
			"Support is the GitHub issue tracker and the docs. There is no support desk. HubSpot has a support organisation.",
	},
] as const;

export default function HubSpotComparisonPage() {
	return (
		<LandingShell>
			<PageHero
				title="Reloop CRM vs HubSpot: a fair comparison"
				lede="Two different kinds of product. HubSpot is a hosted commercial CRM with a large platform around it. Reloop CRM is open source, runs on your server and does one job. Here is what each does better."
			/>

			<PageSection title="The short version">
				<Prose>
					<p>
						HubSpot is a hosted commercial product. You sign up, the servers are
						theirs, and a large ecosystem of integrations and agencies has grown
						around it. The plans, the prices and the limits change over time, so
						this page does not repeat them. Read them on{" "}
						<Link href={HUBSPOT_PRICING_URL} target="_blank" rel="noreferrer">
							HubSpot's own pricing page
						</Link>
						.
					</p>
					<p>
						Reloop CRM is free software under the AGPL. You install it on a
						server you control with one command. It connects to your mailbox,
						reads the history, keeps contacts clean and tells you which past
						customers are worth a new call. There is no per seat price and no
						plan to pick.
					</p>
					<p>
						Both are CRMs. That is where the overlap ends. HubSpot is a platform
						with a CRM at the centre. Reloop CRM is a CRM with a mailbox at the
						centre.
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title="What HubSpot does better"
				lede="Four things Reloop CRM does not try to match."
			>
				<CardGrid>
					{HUBSPOT_WINS.map((item) => (
						<BentoCard key={item.title}>
							<CardHeading title={item.title} body={item.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection
				title="What Reloop CRM does better"
				lede="Four things that come from the licence and from where it runs."
			>
				<CardGrid>
					{RELOOP_WINS.map((item) => (
						<BentoCard key={item.title}>
							<CardHeading title={item.title} body={item.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection title="How to decide">
				<Prose>
					<p>
						Choose HubSpot when you need marketing automation, want a vendor to
						call, and have nobody who will run a server. Choose Reloop CRM when
						the customer data must stay in-house, the team is small, and the job
						is winning back the customers you already know. The{" "}
						<Link href="/self-hosted-crm">self-hosted CRM page</Link> lists what
						running it yourself takes, and the{" "}
						<Link href="/open-source-crm">open source CRM page</Link> explains
						what the licence gives you.
					</p>
					<p>
						What this page does not claim: it names no HubSpot price, plan, seat
						limit, record limit or feature count, because those change and
						HubSpot's own page is the only place to read them. It also does not
						claim that Reloop CRM does everything HubSpot does. Reloop CRM has
						no campaigns, no sequences, no mobile app, and the hosted version is
						not open yet.
					</p>
					<p>
						To try Reloop CRM, <Link href="/get-started">install it</Link> with
						one command and connect a mailbox. The{" "}
						<Link href="/docs">docs</Link> cover the rest.
					</p>
				</Prose>
			</PageSection>

			<Faq id="vs-hubspot-faq" items={FAQ} />

			<ClosingCta
				title="A CRM with your mailbox at the centre"
				links={[
					{ href: "/get-started", label: "Get started" },
					{ href: "/self-hosted-crm", label: "What self-hosting takes" },
					{ href: "/for/freight-forwarding", label: "See it in freight" },
				]}
			/>
		</LandingShell>
	);
}
