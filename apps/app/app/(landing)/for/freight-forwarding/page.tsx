import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import {
	BentoCard,
	CardBody,
	CardHeading,
	CardTitle,
} from "@/components/landing/bento-card";
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
	title: "CRM for freight forwarding",
	description:
		"Reloop CRM started inside a freight forwarding company. It reads the inbox where pallet inquiries and quotes live, and shows who is worth a new call.",
};

const READS = [
	{
		title: "Pallet inquiries and quantities",
		body: "Each conversation gets a summary: what was asked, how many units, which lane, what was quoted. Quantities and products are facts on the record, not a note someone forgot to write.",
	},
	{
		title: "Quotes that went quiet",
		body: "A quote with no answer is a lead you already paid for. An inquiry that was left open counts in the ranking, and so does a last email of theirs that nobody answered.",
	},
	{
		title: "Customers who stopped ordering",
		body: "Each deal done with a customer before counts. A company that shipped every month and then stopped rises in the list, with the last thread one click away.",
	},
	{
		title: "Clean contacts",
		body: "Carrier newsletters, no-reply addresses, out of office replies and your own colleagues never become contacts. The list holds the people who ship with you.",
	},
] as const;

const NUMBERS = [
	{ value: "13,688", label: "conversations read from the mailbox history" },
	{ value: "181", label: "companies enriched with what the mail says" },
	{ value: "178", label: "people marked as worth a new call" },
] as const;

const FAQ = [
	{
		question: "Does it work with our Outlook mailbox?",
		answer:
			"Yes. Microsoft 365, Google Workspace and any IMAP mailbox. Microsoft and Google need an OAuth client of your own, and the docs show the steps. IMAP needs no extra setup.",
	},
	{
		question: "Does it need AI?",
		answer:
			"The summaries and the win back ranking need an API key from OpenRouter, OpenAI or Anthropic. Without a key it is a normal CRM with clean contacts, companies and deals.",
	},
	{
		question: "Does it read every email?",
		answer:
			"It reads the mailbox history once and then keeps it in sync, over IMAP, Gmail and Microsoft 365 alike. You choose how far back when you connect. Newsletters, out of office replies and your own addresses stay out of the contact list.",
	},
	{
		question: "Is it only for freight forwarding?",
		answer:
			"No. It was built there, but it reads any business mailbox. Onboarding asks what you sell, and the agent learns the rest from your website and your mail.",
	},
] as const;

export default function FreightForwardingPage() {
	return (
		<LandingShell>
			<PageHero
				title="A CRM for freight forwarding, built by a forwarder"
				lede="Reloop CRM started inside a freight forwarding company. It reads the inbox where the pallet inquiries, the quotes and the silence all live, and shows which customers are worth a new call."
			/>

			<PageSection title="The problem in a forwarder's inbox">
				<Prose>
					<p>
						A freight forwarding company runs on email. A customer asks for a
						price on twelve pallets to Milan. You quote. Sometimes they book,
						sometimes they go quiet, and the thread sinks under the next
						hundred. A year later nobody remembers that this customer used to
						ship every month, or that the last quote never got an answer.
					</p>
					<p>
						A normal CRM asks you to type all of this in. Nobody in dispatch has
						time for that, so the CRM stays empty and the knowledge stays in the
						inbox and in the heads of two people. When one of them leaves, it
						leaves with them.
					</p>
					<p>
						Reloop CRM was built by the owner of a forwarding company for
						exactly this. It connects to the company mailbox, reads the whole
						history once, and builds the CRM out of what is already there.
						Nobody types anything in.
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title="What it reads out of the mail"
				lede="The facts a forwarder needs, pulled from the threads that already exist."
			>
				<CardGrid>
					{READS.map((item) => (
						<BentoCard key={item.title}>
							<CardHeading title={item.title} body={item.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection
				title="Numbers from the owner's own install"
				lede="These come from the company Reloop CRM was built in. They are one install, not a benchmark."
			>
				<CardGrid>
					{NUMBERS.map((item) => (
						<BentoCard key={item.value}>
							<CardTitle>{item.value}</CardTitle>
							<CardBody>{item.label}</CardBody>
						</BentoCard>
					))}
				</CardGrid>
				<Prose>
					<p>
						Every one of those 178 people once asked for a price, booked a
						shipment, or stopped ordering. The list is ranked by what happened
						in the thread: an inquiry left open, a last email unanswered, deals
						done before, a quantity above the line you set. 400 units is one
						truck load, and the rules know that. Nobody guessed. The owner then
						marks a person as worth it or not, and the agent tunes the weights
						from those verdicts.
					</p>
				</Prose>
			</PageSection>

			<PageSection title="How a forwarder uses it">
				<Prose>
					<p>
						Monday morning: open the win back list. The top entries are the
						customers whose silence costs the most. Each one shows the last
						conversation, so the call starts with the six pallets to Lyon they
						asked about in March, not with a question about how things are
						going.
					</p>
					<p>
						Before a quote: open the company. The timeline shows every earlier
						quote, what was accepted and what was not, and who wrote last. The
						summary of each thread is one line, so nobody opens an email to find
						out what happened.
					</p>
					<p>
						At onboarding: say what you ship and where. The agent reads your
						website and your mail to learn the rest, and sharpens its rules from
						what you accept and dismiss. Side ware you still take but rank lower
						goes on a list. The minimum quantity that counts as serious is a
						number you set.
					</p>
					<p>
						The data stays in-house. Rates and customer lists never leave the
						server, which matters when that server holds every quote you ever
						sent. The <Link href="/self-hosted-crm">self-hosted CRM page</Link>{" "}
						lists what the server needs, and the{" "}
						<Link href="/open-source-crm">open source CRM page</Link> explains
						why you can read every line of the code that touches your mail.
					</p>
					<p>
						To start, <Link href="/get-started">install it</Link> with one
						command, connect the company mailbox and let it read. The{" "}
						<Link href="/docs">docs</Link> cover the mailbox and AI setup.
					</p>
				</Prose>
			</PageSection>

			<Faq id="freight-forwarding-faq" items={FAQ} />

			<ClosingCta
				title="Every quote you ever sent, ranked by what happened next"
				links={[
					{ href: "/get-started", label: "Get started" },
					{ href: "/self-hosted-crm", label: "What self-hosting takes" },
					{ href: "/vs/hubspot", label: "Compare with HubSpot" },
				]}
			/>
		</LandingShell>
	);
}
