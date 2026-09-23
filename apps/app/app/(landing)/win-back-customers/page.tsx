import { BRAND } from "@crm/ui/lib/brand";
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
	SelfHostNote,
} from "@/components/landing/page-blocks";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	const title = t("Win back customers: reactivate the ones who went quiet");
	const description = t(
		"Reloop CRM reads your mailbox, finds the customers who stopped ordering or answering, shows why each one matters, and writes a draft of the mail that brings them back.",
	);
	const images = [
		{
			url: "/opengraph-image",
			width: 1200,
			height: 630,
			alt: `${BRAND.name}: ${BRAND.tagline}`,
		},
	];
	return {
		title,
		description,
		alternates: { canonical: "/win-back-customers" },
		openGraph: {
			type: "website",
			siteName: BRAND.name,
			url: "/win-back-customers",
			title,
			description,
			images,
		},
		twitter: { card: "summary_large_image", title, description, images },
	};
}

export default async function WinBackCustomersPage() {
	const t = await getT();

	const finds = [
		{
			title: t("Customers who bought and then went quiet"),
			body: t(
				"A company that did business with you and then stopped writing rises in the list. The last conversation is one click away.",
			),
		},
		{
			title: t("Quotes nobody closed"),
			body: t(
				"An inquiry or an offer that never led to a yes or a no counts in the ranking. So does a last email of theirs that nobody answered.",
			),
		},
		{
			title: t("What they asked for"),
			body: t(
				"Every conversation gets a short summary: what was asked, which product, how many units. You read what happened without opening a single email.",
			),
		},
		{
			title: t("A clean list"),
			body: t(
				"Out of office replies, no-reply addresses and your own addresses stay out of the CRM. Domains you block, a supplier or a bank for example, never show up in the list.",
			),
		},
	];

	const faq = [
		{
			question: t("How do I find inactive customers?"),
			answer: t(
				"Connect your mailbox. Reloop CRM reads the history and lists everyone who wrote with you and then went quiet, sorted by what a new mail is worth. You choose how far back it reads when you connect.",
			),
		},
		{
			question: t("Does Reloop send mails to my customers?"),
			answer: t(
				"No. Reloop has read access only. It writes a draft, and sending stays with you.",
			),
		},
		{
			question: t("Does it need AI?"),
			answer: t(
				"The summaries, the drafts and the facts read out of each conversation need AI. Reloop Cloud has plans with AI included. On your own server you add a key of your own.",
			),
		},
		{
			question: t("Does it fit my business?"),
			answer: t(
				"It reads any business mailbox and is not built for one industry. Onboarding asks what you sell, and the agent learns the rest from your website and your mail.",
			),
		},
	];

	return (
		<LandingShell>
			<PageHero
				title={t("Win back the customers who went quiet")}
				lede={t(
					"Reloop CRM reads the mailbox you already have, finds the customers who stopped writing, and shows you who is worth a new mail.",
				)}
			/>

			<PageSection title={t("Why customers go quiet")} tone="secondary">
				<Prose>
					<p>
						{t(
							"A customer asks for a quote. You send it. Sometimes they order, sometimes the answer never comes, and the thread sinks under the next hundred. A year later nobody remembers that this customer used to write every month.",
						)}
					</p>
					<p>
						{t(
							"Most of these customers did not leave on purpose. Nobody wrote again. Who they are is in the mailbox, and a normal CRM only knows what someone typed in.",
						)}
					</p>
					<p>
						{t(
							"Winning a customer back starts with knowing who went quiet. Reloop CRM connects to Gmail, Microsoft 365 or any IMAP mailbox, reads the history once, and builds that list from what is already there.",
						)}
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title={t("What it finds in your mail")}
				lede={t(
					"The facts that make a quiet customer worth a new mail, pulled from threads that already exist.",
				)}
			>
				<CardGrid>
					{finds.map((item) => (
						<BentoCard key={item.title}>
							<CardHeading title={item.title} body={item.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection
				title={t("Why each one matters")}
				lede={t(
					"Every point in the win back score has a reason. You check it yourself.",
				)}
				tone="secondary"
			>
				<Prose>
					<p>
						{t(
							"The list is sorted by points, and every point has a line that says where it came from: deals done before, an inquiry left open, a last email unanswered, the quantity they asked for, how often you wrote to each other.",
						)}
					</p>
					<p>
						{t(
							"You mark a person as worth it or not for us. The agent reads those verdicts and tunes the weighting, or you set the weights yourself. A person you mark as not for us stays out of the list.",
						)}
					</p>
				</Prose>
			</PageSection>

			<PageSection title={t("The mail that brings them back")}>
				<Prose>
					<p>
						{t(
							"Open a person from the list and ask for a draft. The agent reads your last conversations with them and writes a mail that picks up where you left off, in the language the conversation used.",
						)}
					</p>
					<p>
						{t(
							"It writes in your voice, because it learns from mails you sent yourself. Tell it what should be different, and it writes the draft again. What it learns from that stays for the next draft.",
						)}
					</p>
					<p>
						{t(
							"Reloop sends nothing. You copy the draft or open it in your mail program, change what you want, and send it yourself.",
						)}
					</p>
				</Prose>
				<SelfHostNote />
			</PageSection>

			<Faq id="win-back-customers-faq" items={faq} tone="secondary" />

			<ClosingCta
				title={t("Every customer who went quiet, with a reason to write again")}
				secondary={{ href: "/vs/hubspot", label: t("Compare with HubSpot") }}
			/>
		</LandingShell>
	);
}
