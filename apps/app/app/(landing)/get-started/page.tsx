import type { Metadata } from "next";
import { CloudCard } from "@/components/landing/cloud-card";
import { LandingShell } from "@/components/landing/landing-shell";
import { Band, PageHero, SelfHostNote } from "@/components/landing/page-blocks";

export const metadata: Metadata = {
	title: "Get started",
	description:
		"Join the waitlist for Reloop Cloud and hear the day your trial can start.",
};

export default function GetStartedPage() {
	return (
		<LandingShell>
			<PageHero
				title="Get started"
				size="title"
				lede="Reloop Cloud opens soon. Leave your email and we send you one message the day your trial can start."
				actions={null}
			/>

			<Band tone="secondary">
				<CloudCard />
				<SelfHostNote />
			</Band>
		</LandingShell>
	);
}
