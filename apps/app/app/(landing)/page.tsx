import GitHubLogo from "@crm/ui/components/brand-logos/github";
import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import NextLink from "next/link";
import Script from "next/script";
import { BentoCard, CardHeading } from "@/components/landing/bento-card";
import { LandingShell } from "@/components/landing/landing-shell";
import { SectionHeading } from "@/components/landing/section-heading";
import { REPO_URL } from "@/components/landing/site";
import { siteAddress } from "@/lib/site-address";

export const metadata: Metadata = {
	title: {
		absolute: "Reloop CRM: the open-source CRM that wins customers back",
	},
	description:
		"Reloop CRM is an open-source, self-hosted CRM. It reads your mailbox history, keeps contacts clean, and tells you which past customers are worth winning back.",
};

const FEATURES = [
	{
		title: "Your mailbox is the starting point",
		body: "Connect Gmail, Outlook or any IMAP inbox. Over IMAP Reloop CRM reads the history, and it files every real conversation under the right contact and company.",
	},
	{
		title: "Contacts stay clean",
		body: "Newsletters, no-reply addresses and your own colleagues never become contacts. A contact you delete stays deleted.",
	},
	{
		title: "It tells you who to win back",
		body: "Past customers who went quiet show up with the reason they are worth a new conversation, so you know whom to call first.",
	},
	{
		title: "An agent that learns your business",
		body: "It reads your website and your mail to learn what you sell, then sharpens its rules from what you accept and dismiss. Bring your own AI key, or run without AI.",
	},
] as const;

function softwareEntry() {
	const site = siteAddress();

	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "Reloop CRM",
		applicationCategory: "BusinessApplication",
		operatingSystem: "Linux, macOS, Docker",
		description:
			"Open-source, self-hosted CRM that reads your mailbox history and tells you which past customers are worth winning back.",
		url: site?.toString(),
		license: "https://spdx.org/licenses/AGPL-3.0-only.html",
		isAccessibleForFree: true,
		codeRepository: REPO_URL,
		offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
	};
}

export default function Home() {
	return (
		<LandingShell>
			<Script id="software-entry" type="application/ld+json">
				{JSON.stringify(softwareEntry())}
			</Script>
			<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20 pb-10 md:pt-30">
				<div className="relative flex w-full max-w-6xl flex-col items-center gap-7">
					<h1 className="max-w-[900px] text-balance text-center font-semibold text-5xl/[52px] tracking-tight md:text-[72px]/[76px]">
						Win back the customers you already have
					</h1>

					<p className="max-w-[640px] text-pretty text-center text-muted-foreground text-lg/[28px] md:text-xl/[30px]">
						Reloop CRM is an open-source, self-hosted CRM. It reads your mailbox
						history, keeps contacts clean, and tells you which past customers
						are worth winning back, with an AI agent that learns your business.
					</p>

					<div className="flex flex-wrap items-center justify-center gap-3 pt-3">
						<Button size="xl" asChild>
							<NextLink href="/get-started">Get started</NextLink>
						</Button>
						<Button variant="outline" size="xl" asChild>
							<a href={REPO_URL} target="_blank" rel="noreferrer">
								<GitHubLogo data-icon="inline-start" />
								View on GitHub
							</a>
						</Button>
					</div>
				</div>
			</section>

			<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20 pb-20 md:pb-30">
				<div className="flex w-full max-w-6xl flex-col gap-12">
					<SectionHeading
						title="What it does"
						lede="Everything runs on your own server. Your customer data never leaves it."
					/>
					<div className="grid gap-4 md:grid-cols-2">
						{FEATURES.map((feature) => (
							<BentoCard key={feature.title}>
								<CardHeading title={feature.title} body={feature.body} />
							</BentoCard>
						))}
					</div>
				</div>
			</section>

			<section className="relative flex w-full shrink-0 flex-col items-center gap-7 px-6 pb-20 md:pb-30">
				<h2 className="text-balance text-center font-semibold text-4xl/[42px] tracking-tight md:text-[44px]/[50px]">
					Your server. Your data. Your CRM.
				</h2>
				<div className="flex flex-wrap items-center justify-center gap-3">
					<Button variant="outline" size="xl" asChild>
						<NextLink href="/docs">Read the docs</NextLink>
					</Button>
				</div>
			</section>
		</LandingShell>
	);
}
