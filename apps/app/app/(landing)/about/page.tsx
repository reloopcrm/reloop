import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";
import { REPO_URL } from "@/components/landing/site";

export const metadata: Metadata = {
	title: "About",
	description:
		"Who builds Reloop CRM, what it does, and the licence it ships under.",
};

export default function AboutPage() {
	return (
		<LandingShell>
			<main className="mx-auto flex w-full max-w-(--container-page) flex-1 flex-col gap-6 px-6 py-10">
				<h1 className="font-medium text-3xl tracking-tight">About</h1>

				<p className="text-body-foreground text-sm/6">
					Reloop CRM is an open source CRM. It connects to your mailbox, reads
					every conversation and remembers what it was about: closed deals, open
					inquiries, quantities, products. From that it builds a list of people
					worth another try, ranked by facts instead of gut feeling.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					What it does
				</h2>

				<p className="text-body-foreground text-sm/6">
					Any mailbox works. IMAP, Google Workspace or Microsoft 365. The full
					history is read once, then kept in sync. You choose how far back when
					you connect the mailbox.
				</p>

				<p className="text-body-foreground text-sm/6">
					An agent reads along. Every conversation gets a short summary and
					every message one line, so a thread is readable without opening a
					single email. Out of office replies, newsletter recipients who never
					answered and your own addresses stay out of the CRM.
				</p>

				<p className="text-body-foreground text-sm/6">
					The AI is yours. Reloop CRM uses an OpenRouter, OpenAI or Anthropic
					API key that you hold. Without a key the CRM still works, only without
					the AI parts.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					How you run it
				</h2>

				<p className="text-body-foreground text-sm/6">
					You run Reloop CRM on your own server. One command installs it on a
					Linux machine with Docker. The installer asks for your domain, your
					email and a password, then starts the database, the API, the web app
					and the agent. Your mail, your contacts and your deals stay on that
					server. A hosted cloud version comes later.
				</p>

				<h2 className="pt-4 font-medium text-foreground text-xl tracking-tight">
					Licence
				</h2>

				<p className="text-body-foreground text-sm/6">
					Reloop CRM is free software under the GNU Affero General Public
					License, version 3. Copyright (C) 2026 Reloop CRM contributors. It is
					derived from Comp AI CRM, whose MIT licence stays valid and whose
					copyright notice stays in place. The full text of both is on the open
					source page.
				</p>

				<p className="text-body-foreground text-sm/6">
					The source code is public. Read it, change it, run your own copy. The
					repository holds the guide for every part of the product, and the
					rules for anybody who wants to contribute.
				</p>

				<p className="text-muted-foreground text-sm/6">
					<Link
						variant="quiet"
						href={REPO_URL}
						target="_blank"
						rel="noreferrer"
					>
						The source code on GitHub
					</Link>
				</p>

				<p className="text-muted-foreground text-sm/6">
					<Link variant="quiet" href="/">
						Back to the start page
					</Link>
				</p>
			</main>
		</LandingShell>
	);
}
