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
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("About Reloop CRM"),
		description: t(
			"Who builds Reloop CRM, what it does, and the licence it ships under.",
		),
	};
}

export default async function AboutPage() {
	const t = await getT();

	return (
		<LandingShell>
			<PageHero
				title={t("About Reloop CRM")}
				size="title"
				lede={t(
					"Reloop CRM connects to your mailbox, reads every conversation and remembers what it was about: closed deals, open inquiries, quantities, products.",
				)}
			/>

			<Band tone="secondary">
				<Prose>
					<p>
						{t(
							"From that it builds a list of people worth another try, ranked by facts instead of gut feeling.",
						)}
					</p>

					<ProseHeading>{t("What it does")}</ProseHeading>

					<p>
						{t(
							"Any mailbox works. IMAP, Google Workspace or Microsoft 365. The full history is read once, then kept in sync. You choose how far back when you connect the mailbox.",
						)}
					</p>

					<p>
						{t(
							"An agent reads along. Every conversation gets a short summary and every message one line, so a thread is readable without opening a single email. Out of office replies, newsletter recipients who never answered and your own addresses stay out of the CRM.",
						)}
					</p>

					<p>
						{t(
							"The AI is yours. Reloop CRM uses an OpenRouter, OpenAI or Anthropic API key that you hold. Without a key the CRM still works, only without the AI parts.",
						)}
					</p>

					<ProseHeading>{t("Licence")}</ProseHeading>

					<p>
						{t(
							"Reloop CRM is free software under the GNU Affero General Public License, version 3. Copyright (C) 2026 Reloop CRM contributors. It is derived from Comp AI CRM, whose MIT licence stays valid and whose copyright notice stays in place.",
						)}{" "}
						<Link href="/open-source">
							{t("The full text of both is on the open source page.")}
						</Link>
					</p>

					<p className="text-muted-foreground text-sm/6">
						{t("The source code is public, and you can run your own copy.")}{" "}
						<Link
							variant="quiet"
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
						>
							{t("The source code on GitHub")}
						</Link>
						{" · "}
						<Link variant="quiet" href="/self-hosted-crm">
							{t("What self-hosting takes")}
						</Link>
					</p>
				</Prose>
			</Band>
		</LandingShell>
	);
}
