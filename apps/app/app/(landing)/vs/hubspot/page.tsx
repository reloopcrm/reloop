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
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Reloop vs HubSpot: a fair comparison"),
		description: t(
			"HubSpot is a hosted commercial CRM with a large platform. Reloop CRM is a CRM with a mailbox at the centre. What each does better, with no invented numbers.",
		),
	};
}

export default async function HubSpotComparisonPage() {
	const t = await getT();

	const hubspotWins = [
		{
			title: t("A large ecosystem"),
			body: t(
				"Years of integrations, agencies and training material. Reloop CRM has what its contributors have built, and that is far less.",
			),
		},
		{
			title: t("Marketing automation"),
			body: t(
				"Campaigns and sequences are part of HubSpot. Reloop CRM sends neither. It reads mail and ranks customers, and that is the whole job.",
			),
		},
		{
			title: t("Support"),
			body: t(
				"HubSpot has a support organisation. Reloop CRM has an issue tracker. An answer comes when a maintainer or another user has time.",
			),
		},
	];

	const reloopWins = [
		{
			title: t("Built around your mailbox"),
			body: t(
				"It builds companies, contacts and deals out of real conversations, so the first day already shows what happened with each customer.",
			),
		},
		{
			title: t("Reads only. Never sends."),
			body: t("Reloop has read access only. No mail goes out without you."),
		},
		{
			title: t("Value, point by point."),
			body: t(
				"Every point in the win back score has a reason. You check it yourself.",
			),
		},
	];

	const faq = [
		{
			question: t("Is Reloop CRM a replacement for HubSpot?"),
			answer: t(
				"For a small sales team that lives in email, yes for the CRM part. For marketing automation, no. Reloop CRM sends no campaigns and no sequences.",
			),
		},
		{
			question: t("Can I move from HubSpot to Reloop CRM?"),
			answer: t(
				"Reloop CRM builds contacts and companies from your mailbox, so the history comes along with the mail. There is no HubSpot import. A contact that exists only in HubSpot needs a manual step.",
			),
		},
		{
			question: t("What does Reloop CRM cost compared with HubSpot?"),
			answer: t(
				"Reloop CRM's plans are on the pricing page. For HubSpot's prices and plans, read HubSpot's own pricing page. This page does not repeat them.",
			),
		},
	];

	return (
		<LandingShell>
			<PageHero
				title={t("Reloop CRM vs HubSpot: a fair comparison")}
				lede={t(
					"HubSpot is a platform with a CRM at the centre. Reloop CRM is a CRM with a mailbox at the centre. Here is what each does better.",
				)}
			/>

			<PageSection title={t("The short version")} tone="secondary">
				<Prose>
					<p>
						{t(
							"HubSpot is a hosted commercial product. You sign up, the servers are theirs, and a large ecosystem has grown around it. The plans, the prices and the limits change over time, so this page names none of them.",
						)}{" "}
						<Link href={HUBSPOT_PRICING_URL} target="_blank" rel="noreferrer">
							{t("Read them on HubSpot's own pricing page.")}
						</Link>
					</p>
					<p>
						{t(
							"Reloop CRM reads your mailbox, keeps contacts clean and tells you which past customers are worth a new call.",
						)}{" "}
						<Link href={PRICING.href}>
							{t("Reloop's plans are on the pricing page.")}
						</Link>
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title={t("What HubSpot does better")}
				lede={t("Three things Reloop CRM does not try to match.")}
			>
				<CardGrid columns={3}>
					{hubspotWins.map((item) => (
						<BentoCard key={item.title}>
							<CardHeading title={item.title} body={item.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection
				title={t("What Reloop CRM does better")}
				lede={t("Three things that come from where it starts: your mailbox.")}
				tone="secondary"
			>
				<CardGrid columns={3}>
					{reloopWins.map((item) => (
						<BentoCard key={item.title}>
							<CardHeading title={item.title} body={item.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection title={t("How to decide")}>
				<Prose>
					<p>
						{t(
							"Choose HubSpot when you need marketing automation, want a vendor to call, and live on its ecosystem. Choose Reloop CRM when the team is small, lives in email, and the job is winning back the customers you already know.",
						)}
					</p>
				</Prose>
				<SelfHostNote />
			</PageSection>

			<Faq id="vs-hubspot-faq" items={faq} tone="secondary" />

			<ClosingCta
				title={t("Try it on the mailbox you already have")}
				secondary={{
					href: "/win-back-customers",
					label: t("How win back works"),
				}}
			/>
		</LandingShell>
	);
}
