import { Link } from "@crm/ui/components/link";
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
} from "@/components/landing/page-blocks";

export const metadata: Metadata = {
	title: "Self-hosted CRM: costs, requirements, setup",
	description:
		"A self-hosted CRM needs a small Linux server, Docker and a domain. What it costs in money and time, how backups work, and what the installer does.",
};

const NEEDS = [
	{
		title: "A Linux server with 4 GB of RAM",
		body: "Docker runs Postgres, the API, the web app and the agent side by side. 2 GB works for one user and leaves little room. The images are built for amd64 and arm64.",
	},
	{
		title: "20 GB of free disk",
		body: "For the images, the database and the backups. Years of mailbox history fit with room to spare, because the text of an email is small.",
	},
	{
		title: "Docker",
		body: "The installer sets Docker up when it is missing. On macOS it starts OrbStack or Docker Desktop, and installs OrbStack when neither is there.",
	},
	{
		title: "A domain",
		body: "Point a DNS record at the server and open ports 80 and 443. The bundled Caddy fetches a certificate. Behind your own reverse proxy, answer one question and Caddy stays off.",
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
			"Yes. Press Enter at the domain question and the app opens at http://localhost:3000. Sign-in works there, because the session cookie drops the secure prefix on plain http.",
	},
	{
		question: "What happens if I lose the server?",
		answer:
			"Restore the last pg_dump and deploy/.env on a new server, then run the installer again. Without the .env file the database cannot be opened, so back up both.",
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
				lede="A self-hosted CRM costs a small server and a few hours a year. Here is what you need, what it costs, and how backups and updates work."
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

			<PageSection title="What it costs">
				<Prose>
					<p>
						The software is free under the AGPL. The server is the whole bill. A
						virtual server with 4 GB of RAM is a standard size at every hosting
						provider. There is no per seat price, so the bill stays the same
						when the whole team signs in.
					</p>
					<p>
						AI is optional and pay as you go. With OpenRouter you buy prepaid
						credits and the agent spends them per token. Without a key the CRM
						costs nothing beyond the server.
					</p>
					<p>
						The install is one session at a terminal. Updates are two commands
						in the deploy folder:{" "}
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
				</Prose>
			</PageSection>

			<PageSection title="Backups">
				<Prose>
					<p>
						Everything lives in the{" "}
						<code className="font-mono text-foreground">postgres-data</code>{" "}
						volume and in{" "}
						<code className="font-mono text-foreground">deploy/.env</code>.
						Without that .env file the database cannot be opened again, so back
						up both. A nightly pg_dump is one cron line, and the{" "}
						<Link href="/docs">docs</Link> print it.
					</p>
				</Prose>
			</PageSection>

			<PageSection title="What the installer does">
				<Prose>
					<p>
						It installs into{" "}
						<code className="font-mono text-foreground">~/reloop/deploy</code>,
						generates the secrets with openssl, writes deploy/.env with
						permissions 600, pulls the images and creates the owner account.
						Running it again keeps your .env file and never touches the database
						volume. The command is on the{" "}
						<Link href="/get-started">get started page</Link>.
					</p>
				</Prose>
			</PageSection>

			<PageSection title="Self-hosted or hosted?">
				<Prose>
					<p>
						A hosted CRM gives you no server to run and a support desk to call.
						If nobody on the team will open a terminal, wait for the hosted
						Reloop CRM. It is not open yet. The{" "}
						<Link href="/vs/hubspot">comparison with HubSpot</Link> lays the two
						side by side.
					</p>
				</Prose>
			</PageSection>

			<Faq id="self-hosted-crm-faq" items={FAQ} />

			<ClosingCta
				title="Your server. Your data. Your CRM."
				links={[
					{ href: "/get-started", label: "Get started" },
					{ href: "/docs", label: "Read the docs" },
				]}
			/>
		</LandingShell>
	);
}
