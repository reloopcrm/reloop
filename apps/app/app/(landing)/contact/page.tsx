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
	title: "Contact",
	description: "How to reach the people who build and run Reloop CRM.",
};

const PLACEHOLDER = {
	entity: "{{LEGAL_ENTITY}}",
	address: "{{POSTAL_ADDRESS}}",
	supportEmail: "{{SUPPORT_EMAIL}}",
	securityEmail: "{{SECURITY_EMAIL}}",
	securityPolicy: "{{SECURITY_RESPONSE_POLICY}}",
} as const;

export default function ContactPage() {
	return (
		<LandingShell>
			<PageHero
				title="Contact"
				size="title"
				lede="Reloop CRM is built in the open. Most questions are answered faster in the repository than in an inbox, because the answer stays there for the next person."
				actions={null}
			/>

			<Band tone="secondary">
				<Prose>
					<p>Pick the channel that fits what you need.</p>

					<ProseHeading>A bug or an idea</ProseHeading>

					<p>
						Open an issue in the repository. Write what you did, what you
						expected and what happened instead. Name the version you run. The
						version is on the status page of your install. A bug report with a
						version and a step list gets fixed. One without them gets questions.
					</p>

					<p className="text-muted-foreground text-sm/6">
						<Link
							variant="quiet"
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
						>
							Open an issue on GitHub
						</Link>
					</p>

					<ProseHeading>A question about running it</ProseHeading>

					<p>
						The docs cover the install, the update, the backup and the move to
						another domain. Read the guide first. It answers most of what a new
						install asks.
					</p>

					<p className="text-muted-foreground text-sm/6">
						<Link variant="quiet" href="/docs">
							Read the docs
						</Link>
					</p>

					<ProseHeading>Email</ProseHeading>

					<p>
						Write to {PLACEHOLDER.supportEmail} for anything that does not
						belong in a public issue. That covers a question about your own
						data, a licence question, or press.
					</p>

					<p>
						Report a security problem to {PLACEHOLDER.securityEmail}. Do not
						open a public issue for it. Describe the problem and how to
						reproduce it. {PLACEHOLDER.securityPolicy}
					</p>

					<ProseHeading>Postal address</ProseHeading>

					<p>{PLACEHOLDER.entity}</p>

					<p>{PLACEHOLDER.address}</p>
				</Prose>
			</Band>
		</LandingShell>
	);
}
