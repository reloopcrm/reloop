import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";
import {
	Band,
	PageHero,
	Prose,
	ProseHeading,
} from "@/components/landing/page-blocks";
import { REPO_URL } from "@/components/landing/site";

export const metadata: Metadata = {
	title: "About",
	description:
		"Who builds Reloop CRM, what it does, and the licence it ships under.",
};

export default function AboutPage() {
	return (
		<LandingShell>
			<PageHero
				title="About"
				size="title"
				lede="Reloop CRM connects to your mailbox, reads every conversation and remembers what it was about: closed deals, open inquiries, quantities, products."
			/>

			<Band tone="secondary">
				<Prose>
					<p>
						From that it builds a list of people worth another try, ranked by
						facts instead of gut feeling.
					</p>

					<ProseHeading>What it does</ProseHeading>

					<p>
						Any mailbox works. IMAP, Google Workspace or Microsoft 365. The full
						history is read once, then kept in sync. You choose how far back
						when you connect the mailbox.
					</p>

					<p>
						An agent reads along. Every conversation gets a short summary and
						every message one line, so a thread is readable without opening a
						single email. Out of office replies, newsletter recipients who never
						answered and your own addresses stay out of the CRM.
					</p>

					<p>
						The AI is yours. Reloop CRM uses an OpenRouter, OpenAI or Anthropic
						API key that you hold. Without a key the CRM still works, only
						without the AI parts.
					</p>

					<ProseHeading>Licence</ProseHeading>

					<p>
						Reloop CRM is free software under the GNU Affero General Public
						License, version 3. Copyright (C) 2026 Reloop CRM contributors. It
						is derived from Comp AI CRM, whose MIT licence stays valid and whose
						copyright notice stays in place. The full text of both is on the{" "}
						<Link href="/open-source">open source page</Link>.
					</p>

					<p className="text-muted-foreground text-sm/6">
						The source code is public, and you can run your own copy.{" "}
						<Link
							variant="quiet"
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
						>
							The source code on GitHub
						</Link>
						{" or "}
						<Link variant="quiet" href="/self-hosted-crm">
							what self-hosting takes
						</Link>
						.
					</p>
				</Prose>
			</Band>
		</LandingShell>
	);
}
