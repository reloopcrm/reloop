import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";
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
			<main className="mx-auto flex w-full max-w-(--container-page) flex-1 flex-col gap-6 px-6 py-10">
				<h1 className="font-medium text-3xl tracking-tight">Contact</h1>

				<p className="text-body-foreground text-sm/6">
					Reloop CRM is built in the open. Most questions are answered faster in
					the repository than in an inbox, because the answer stays there for
					the next person. Pick the channel that fits what you need.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					A bug or an idea
				</h2>

				<p className="text-body-foreground text-sm/6">
					Open an issue in the repository. Write what you did, what you expected
					and what happened instead. Name the version you run. The version is on
					the status page of your install. A bug report with a version and a
					step list gets fixed. One without them gets questions.
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

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					A question about running it
				</h2>

				<p className="text-body-foreground text-sm/6">
					The docs cover the install, the update, the backup and the move to
					another domain. Read the guide first. It answers most of what a new
					install asks.
				</p>

				<p className="text-muted-foreground text-sm/6">
					<Link variant="quiet" href="/docs">
						Read the docs
					</Link>
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					Email
				</h2>

				<p className="text-body-foreground text-sm/6">
					Write to {PLACEHOLDER.supportEmail} for anything that does not belong
					in a public issue. That covers a question about your own data, a
					licence question, or press.
				</p>

				<p className="text-body-foreground text-sm/6">
					Report a security problem to {PLACEHOLDER.securityEmail}. Do not open
					a public issue for it. Describe the problem and how to reproduce it.
					{PLACEHOLDER.securityPolicy}
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					Postal address
				</h2>

				<p className="text-body-foreground text-sm/6">{PLACEHOLDER.entity}</p>

				<p className="text-body-foreground text-sm/6">{PLACEHOLDER.address}</p>

				<p className="text-muted-foreground text-sm/6">
					<Link variant="quiet" href="/">
						Back to the start page
					</Link>
				</p>
			</main>
		</LandingShell>
	);
}
