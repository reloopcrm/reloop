import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { BentoCard, CardHeading } from "@/components/landing/bento-card";
import { CopyCommand } from "@/components/landing/copy-command";
import { Faq } from "@/components/landing/faq";
import { LandingShell } from "@/components/landing/landing-shell";
import {
	CardGrid,
	ClosingCta,
	CloudBanner,
	PageHero,
	PageSection,
	PRICING,
	Prose,
} from "@/components/landing/page-blocks";
import { INSTALL_COMMAND } from "@/components/landing/site";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Self-hosted CRM: costs, requirements, setup"),
		description: t(
			"A self-hosted CRM needs a small Linux server, Docker and a domain. What it costs in money and time, how backups work, and what the installer does.",
		),
	};
}

export default async function SelfHostedCrmPage() {
	const t = await getT();

	const needs = [
		{
			title: t("A Linux server with 4 GB of RAM"),
			body: t(
				"Docker runs Postgres, the API, the web app and the agent side by side. 2 GB works for one user and leaves little room. The images are built for amd64 and arm64.",
			),
		},
		{
			title: t("20 GB of free disk"),
			body: t(
				"For the images, the database and the backups. Years of mailbox history fit with room to spare, because the text of an email is small.",
			),
		},
		{
			title: t("Docker"),
			body: t(
				"The installer sets Docker up when it is missing. On macOS it starts OrbStack or Docker Desktop, and installs OrbStack when neither is there.",
			),
		},
		{
			title: t("A domain"),
			body: t(
				"Point a DNS record at the server and open ports 80 and 443. The bundled Caddy fetches a certificate. Behind your own reverse proxy, answer one question and Caddy stays off.",
			),
		},
	];

	const faq = [
		{
			question: t("Do I need to know Docker?"),
			answer: t(
				"No. The installer sets Docker up and starts everything. Two Docker Compose commands cover updates, and the docs show them.",
			),
		},
		{
			question: t("Can I run it on localhost first?"),
			answer: t(
				"Yes. Press Enter at the domain question and the app opens at http://localhost:3000. Sign-in works there, because the session cookie drops the secure prefix on plain http.",
			),
		},
		{
			question: t("What happens if I lose the server?"),
			answer: t(
				"Restore the last pg_dump and deploy/.env on a new server, then run the installer again. Without the .env file the database cannot be opened, so back up both.",
			),
		},
		{
			question: t("How do I stay on one version?"),
			answer: t(
				"Set RELOOP_VERSION in deploy/.env to a version number. Updates then wait until you change it.",
			),
		},
	];

	return (
		<LandingShell>
			<PageHero
				title={t("Run your CRM on a server you control")}
				lede={t(
					"A self-hosted CRM costs a small server and a few hours a year. Here is what you need, what it costs, and how backups and updates work.",
				)}
				actions={null}
			/>

			<CloudBanner />

			<PageSection
				title={t("What you need")}
				lede={t("Four things. The installer takes care of the rest.")}
				tone="secondary"
			>
				<CardGrid>
					{needs.map((need) => (
						<BentoCard key={need.title}>
							<CardHeading title={need.title} body={need.body} />
						</BentoCard>
					))}
				</CardGrid>
			</PageSection>

			<PageSection title={t("What it costs")}>
				<Prose>
					<p>
						{t(
							"The software is free under the AGPL. The server is the whole bill. A virtual server with 4 GB of RAM is a standard size at every hosting provider. There is no per seat price, so the bill stays the same when the whole team signs in.",
						)}
					</p>
					<p>
						{t(
							"AI is optional and pay as you go. With OpenRouter you buy prepaid credits and the agent spends them per token. Without a key the CRM costs nothing beyond the server.",
						)}
					</p>
					<p>
						{t(
							"The install is one session at a terminal. Updates are two commands in the deploy folder:",
						)}{" "}
						<code className="font-mono text-foreground">
							docker compose pull
						</code>
						{", "}
						<code className="font-mono text-foreground">
							docker compose up -d
						</code>
						{". "}
						{t(
							"The API applies database migrations when it starts. Read the changelog first, and make a dump before you pull.",
						)}
					</p>
				</Prose>
			</PageSection>

			<PageSection title={t("Backups")} tone="secondary">
				<Prose>
					<p>
						{t("Everything lives in the {volume} volume and in {file}.", {
							volume: "postgres-data",
							file: "deploy/.env",
						})}{" "}
						{t(
							"Without that .env file the database cannot be opened again, so back up both. A nightly pg_dump is one cron line.",
						)}{" "}
						<Link href="/docs">{t("The docs print it.")}</Link>
					</p>
				</Prose>
			</PageSection>

			<PageSection
				title={t("What the installer does")}
				lede={t(
					"One command installs everything with Docker. It asks for a domain, an email and a password.",
				)}
			>
				<div className="w-full max-w-(--container-page)">
					<CopyCommand command={INSTALL_COMMAND} />
				</div>
				<Prose>
					<p>
						{t("It installs into {folder}.", { folder: "~/reloop/deploy" })}{" "}
						{t(
							"It generates the secrets with openssl, writes deploy/.env with permissions 600, pulls the images and creates the owner account. Running it again keeps your .env file and never touches the database volume.",
						)}
					</p>
				</Prose>
			</PageSection>

			<PageSection title={t("Self-hosted or hosted?")} tone="secondary">
				<Prose>
					<p>
						{t(
							"A hosted CRM gives you no server to run and a support desk to call. If nobody on the team will open a terminal, Reloop Cloud does it for you.",
						)}{" "}
						<Link href={PRICING.href}>
							{t("The plans are on the pricing page.")}
						</Link>{" "}
						<Link href="/vs/hubspot">
							{t(
								"The comparison with HubSpot lays hosted and self-hosted side by side.",
							)}
						</Link>
					</p>
				</Prose>
			</PageSection>

			<Faq id="self-hosted-crm-faq" items={faq} />

			<ClosingCta
				title={t("Your server. Your data. Your CRM.")}
				tone="secondary"
				secondary={{ href: "/docs", label: t("Read the docs") }}
			/>
		</LandingShell>
	);
}
