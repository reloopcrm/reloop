import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import NextLink from "next/link";
import { BentoCard, CardHeading } from "@/components/landing/bento-card";
import { HeroVisual } from "@/components/landing/hero-visual";
import { LandingShell } from "@/components/landing/landing-shell";
import { PageHero } from "@/components/landing/page-blocks";
import { SectionHeading } from "@/components/landing/section-heading";
import { StructuredData } from "@/components/landing/structured-data";

export const metadata: Metadata = {
	title: {
		absolute: "Reloop CRM: the open-source CRM that wins customers back",
	},
	description:
		"Reloop CRM reads years of mail in your inbox and shows which past customers are worth a call. Open source, on your own server.",
	alternates: { canonical: "/" },
};

const FEATURES = [
	{
		title: "It starts in your mailbox",
		body: "Connect Gmail, Outlook or any IMAP inbox. Every real conversation lands on the right contact and company.",
	},
	{
		title: "Contacts stay clean",
		body: "Newsletters, no-reply addresses and your own colleagues never become contacts. What you delete stays deleted.",
	},
	{
		title: "It tells you who to win back",
		body: "A customer who went quiet shows up with the reason to call again, so you know who to ring first. The ranking needs an AI key of your own.",
	},
] as const;

export default function Home() {
	return (
		<LandingShell>
			<StructuredData />
			<PageHero
				title="Win back the customers you already have"
				lede="Reloop CRM reads years of mail in your inbox and shows which past customers are worth a call. Open source, on your own server."
				visual={<HeroVisual />}
			/>

			<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20 pb-20 md:pb-30">
				<div className="flex w-full max-w-(--container-page-wide) flex-col gap-12">
					<SectionHeading title="What it does" />
					<div className="grid gap-4 md:grid-cols-3">
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
