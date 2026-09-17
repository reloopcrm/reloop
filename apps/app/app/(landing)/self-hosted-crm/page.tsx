import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { BentoCard, CardHeading } from "@/components/landing/bento-card";
import { CopyCommand } from "@/components/landing/copy-command";
import { Faq } from "@/components/landing/faq";
import { LandingShell } from "@/components/landing/landing-shell";
import {
	CardGrid,
	ClosingCta,
	PageHero,
	PageSection,
	Prose,
} from "@/components/landing/page-blocks";
import { INSTALL_COMMAND } from "@/components/landing/site";

export const metadata: Metadata = {
	title: "Self-hosted CRM: costs, requirements, setup",
	description:
		"A self-hosted CRM needs a small Linux server, Docker and a domain. What it costs in money and time, how backups work, and the one command install.",
};

const NEEDS = [
	{
		title: "A Linux server with 4 GB of RAM",
		body: "2 GB works for one user but leaves little room. Docker runs Postgres, the API, the web app and the agent side by side, and 4 GB keeps them comfortable. The images are built for amd64 and arm64.",
	},
	{
		title: "20 GB of free disk",
		body: "For the images, the database and the backups. A mailbox with years of history fits with room to spare, because the text of an email is small.",
	},
	{
		title: "Docker",
		body: "The installer sets Docker up for you when it is missing, using Docker's own install script. On macOS it starts OrbStack or Docker Desktop, and installs OrbStack when neither is there.",
	},
	{
		title: "A domain",
		body: "Point a DNS record at the server and open ports 80 and 443. The bundled Caddy fetches a certificate and serves HTTPS. Behind your own reverse proxy, answer one question and Caddy stays off.",
	},
] as const;

const FAQ = [
	{
		question: "Do I need to know Docker?",
		answer:
			"No. The installer sets Docker up and starts everything. Two Docker Compose commands cover updates, and the docs show them.",
	},
	{
		question: "Can I run it on localhost first?",
		answer:
			"Yes. Press Enter at the domain question and the app opens at http://localhost:3000. Sign-in works there because the session cookie drops the secure prefix on plain http.",
	},
	{
		question: "What happens if I lose the server?",
		answer:
			"Restore the last pg_dump and deploy/.env on a new server and run the installer again. Without the .env file the database cannot be opened, so back up both.",
	},
	{
		question: "How do I stay on one version?",
		answer:
			"Set RELOOP_VERSION in deploy/.env to a version number. Updates then wait until you change it.",
	},
] as const;

export default function SelfHostedCrmPage() {
	return (
		<LandingShell>
			<PageHero
				title="Run your CRM on a server you control"
				lede="A self-hosted CRM costs a small server and a few hours a year. Here is what you need, what it costs, how backups and updates work, and the one command that installs Reloop CRM."
			/>

			<PageSection
				title="What you need"
				lede="Four things. The installer takes care of the rest."
			>
				<CardGrid>
					{NEEDS.map((need) => (
						<BentoCard key={need.title}>
							<CardHeading title={need.title} body={need.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection title="What it costs in money">
				<Prose>
					<p>
						The software is free under the AGPL. The server is the cost. A
						virtual server with 4 GB of RAM is a standard size at every hosting
						provider. Check the current monthly price at the provider you
						already use, and add a domain if you do not have one. That is the
						whole bill for a team of any size.
					</p>
					<p>
						AI is pay as you go and optional. With OpenRouter you buy prepaid
						credits and the agent spends them per token. The docs list the
						default model and its rate at the time of writing. Without a key the
						CRM runs with no AI cost at all.
					</p>
					<p>
						There is no per seat price. Add your whole team and the server bill
						does not change. The{" "}
						<Link href="/open-source-crm">open source CRM page</Link> explains
						why the licence fee stays at zero.
					</p>
				</Prose>
			</PageSection>

			<PageSection title="What it costs in time">
				<Prose>
					<p>
						The install is one session at a terminal. The script asks for a
						domain, an email and a password, then pulls the images and starts
						them. When the DNS record already points at the server, the first
						sign-in is minutes away. Connecting a mailbox is a settings page.
						IMAP needs no extra setup. Google and Microsoft need an OAuth client
						of your own, and the docs show the steps.
					</p>
					<p>
						Updates are two commands in the deploy folder:{" "}
						<code className="font-mono text-foreground">
							docker compose pull
						</code>
						, then{" "}
						<code className="font-mono text-foreground">
							docker compose up -d
						</code>
						. The API applies database migrations when it starts. Read the
						changelog first, and make a dump before you pull.
					</p>
					<p>
						Backups are one cron line. Once it is in place, the ongoing work is
						a check now and then that the dump still lands somewhere safe.
					</p>
				</Prose>
			</PageSection>

			<PageSection title="Backups">
				<Prose>
					<p>
						Everything lives in the{" "}
						<code className="font-mono text-foreground">postgres-data</code>{" "}
						volume and in{" "}
						<code className="font-mono text-foreground">deploy/.env</code>.
						Without that .env file the database cannot be opened again, so a
						backup always holds both.
					</p>
					<p>
						A nightly compressed pg_dump that overwrites the previous one is
						enough for a small team. Copy the dump and the .env file to a second
						machine from time to time. Make an extra dump before every update.
						The exact cron line is in the <Link href="/docs">docs</Link>.
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title="The one command"
				lede="Run it on the server. It asks for a domain, an email and a password."
			>
				<BentoCard className="gap-5">
					<CopyCommand command={INSTALL_COMMAND} />
					<Prose>
						<p>
							The script installs into{" "}
							<code className="font-mono text-foreground">~/reloop/deploy</code>
							, generates the secrets with openssl, writes deploy/.env with
							permissions 600, pulls the images, starts them and creates the
							owner account. Running it again keeps your .env file and never
							touches the database volume. Set RELOOP_DOMAIN, RELOOP_EMAIL and
							RELOOP_PASSWORD as variables and it asks nothing.
						</p>
					</Prose>
				</BentoCard>
			</PageSection>

			<PageSection title="Self-hosted or hosted?">
				<Prose>
					<p>
						A hosted CRM gives you no server to run, updates that happen on
						their own and a support desk to call. A self-hosted CRM gives you
						data on your own disk, no per seat price and a bill that does not
						change with the team. The{" "}
						<Link href="/vs/hubspot">comparison with HubSpot</Link> lays the two
						side by side.
					</p>
					<p>
						If nobody on the team will open a terminal, wait for the hosted
						version of Reloop CRM. It is not open yet. Until then, the{" "}
						<Link href="/get-started">get started page</Link> has the command
						and a waitlist.
					</p>
				</Prose>
			</PageSection>

			<Faq id="self-hosted-crm-faq" items={FAQ} />

			<ClosingCta
				title="Your server. Your data. Your CRM."
				links={[
					{ href: "/get-started", label: "Get started" },
					{ href: "/docs", label: "Read the docs" },
					{ href: "/for/freight-forwarding", label: "See it in freight" },
				]}
			/>
		</LandingShell>
	);
}
