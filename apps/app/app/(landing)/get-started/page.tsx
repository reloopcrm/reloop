import GitHubLogo from "@crm/ui/components/brand-logos/github";
import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { BentoCard, CardHeading } from "@/components/landing/bento-card";
import { CloudCard } from "@/components/landing/cloud-card";
import { CopyCommand } from "@/components/landing/copy-command";
import { LandingShell } from "@/components/landing/landing-shell";
import { SectionHeading } from "@/components/landing/section-heading";
import { INSTALL_COMMAND, REPO_URL } from "@/components/landing/site";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const metadata: Metadata = {
	title: "Get started",
	description:
		"Install Reloop CRM on your own server with one command, or join the waitlist for Reloop CRM Cloud.",
};

export default function GetStartedPage() {
	return (
		<LandingShell>
			<main className="flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 py-20">
				<SectionHeading
					title="Get started"
					lede="Run Reloop CRM on your own server today. A hosted version is on the way."
				/>

				<div className="grid gap-4 md:grid-cols-2">
					<BentoCard className="gap-5">
						<CardHeading
							title="Self-host"
							body="One command installs Reloop CRM with Docker. It asks for your domain and your email, then starts everything."
						/>
						<CopyCommand command={INSTALL_COMMAND} />
						<Button variant="outline" asChild className="self-start">
							<a href={REPO_URL} target="_blank" rel="noreferrer">
								<GitHubLogo data-icon="inline-start" />
								View on GitHub
							</a>
						</Button>
					</BentoCard>

					<Suspense fallback={<CloudCard />}>
						<Cloud />
					</Suspense>
				</div>
			</main>
		</LandingShell>
	);
}

async function Cloud() {
	return (
		<CloudCard>{(await waitlistOpen()) ? <WaitlistForm /> : null}</CloudCard>
	);
}

async function waitlistOpen(): Promise<boolean> {
	try {
		const status = await getServerQueryClient().fetchQuery(
			getServerTrpc().waitlist.status.queryOptions(),
		);
		return status.open;
	} catch (error) {
		unstable_rethrow(error);
		return false;
	}
}
