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
	PRICING,
	Prose,
	SelfHostNote,
} from "@/components/landing/page-blocks";
import { HUBSPOT_PRICING_URL } from "@/components/landing/site";

export const metadata: Metadata = {
	title: "Reloop vs HubSpot: a fair comparison",
	description:
		"HubSpot is a hosted commercial CRM with a large platform. Reloop CRM is a CRM with a mailbox at the centre. What each does better, with no invented numbers.",
};

const HUBSPOT_WINS = [
	{
		title: "A large ecosystem",
		body: "Years of integrations, agencies and training material. Reloop CRM has what its contributors have built, and that is far less.",
	},
	{
		title: "Marketing automation",
		body: "Campaigns and sequences are part of HubSpot. Reloop CRM sends neither. It reads mail and ranks customers, and that is the whole job.",
	},
	{
		title: "Support",
		body: "HubSpot has a support organisation. Reloop CRM has an issue tracker. An answer comes when a maintainer or another user has time.",
	},
] as const;

const RELOOP_WINS = [
	{
		title: "Built around your mailbox",
		body: "It builds companies, contacts and deals out of real conversations, so the first day already shows what happened with each customer.",
	},
	{
		title: "Reads only. Never sends.",
		body: "Reloop has read access only. No mail goes out without you.",
	},
	{
		title: "Value, point by point.",
		body: "Every point in the win back score has a reason. You check it yourself.",
	},
] as const;

const FAQ = [
	{
		question: "Is Reloop CRM a replacement for HubSpot?",
		answer:
			"For a small sales team that lives in email, yes for the CRM part. For marketing automation, no. Reloop CRM sends no campaigns and no sequences.",
	},
	{
		question: "Can I move from HubSpot to Reloop CRM?",
		answer:
			"Reloop CRM builds contacts and companies from your mailbox, so the history comes along with the mail. There is no HubSpot import. A contact that exists only in HubSpot needs a manual step.",
	},
	{
		question: "What does Reloop CRM cost compared with HubSpot?",
		answer:
			"Reloop CRM's plans are on the pricing page. For HubSpot's prices and plans, read HubSpot's own pricing page. This page does not repeat them.",
	},
] as const;

export default function HubSpotComparisonPage() {
	return (
		<LandingShell>
			<PageHero
				title="Reloop CRM vs HubSpot: a fair comparison"
				lede="HubSpot is a platform with a CRM at the centre. Reloop CRM is a CRM with a mailbox at the centre. Here is what each does better."
			/>

			<PageSection title="The short version" tone="secondary">
				<Prose>
					<p>
						HubSpot is a hosted commercial product. You sign up, the servers are
						theirs, and a large ecosystem has grown around it. The plans, the
						prices and the limits change over time, so this page names none of
						them. Read them on{" "}
						<Link href={HUBSPOT_PRICING_URL} target="_blank" rel="noreferrer">
							HubSpot's own pricing page
						</Link>
						.
					</p>
					<p>
						Reloop CRM reads your mailbox, keeps contacts clean and tells you
						which past customers are worth a new call. Reloop's plans are on the{" "}
						<Link href={PRICING.href}>pricing page</Link>.
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title="What HubSpot does better"
				lede="Three things Reloop CRM does not try to match."
			>
				<CardGrid columns={3}>
					{HUBSPOT_WINS.map((item) => (
						<BentoCard key={item.title}>
							<CardHeading title={item.title} body={item.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection
				title="What Reloop CRM does better"
				lede="Three things that come from where it starts: your mailbox."
				tone="secondary"
			>
				<CardGrid columns={3}>
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
						call, and live on its ecosystem. Choose Reloop CRM when the team is
						small, lives in email, and the job is winning back the customers you
						already know.
					</p>
				</Prose>
				<SelfHostNote />
			</PageSection>

			<Faq id="vs-hubspot-faq" items={FAQ} tone="secondary" />

			<ClosingCta
				title="Try it on the mailbox you already have"
				secondary={{
					href: "/for/freight-forwarding",
					label: "See it in freight",
				}}
			/>
		</LandingShell>
	);
}
