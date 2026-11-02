import type { Metadata } from "next";
import NextLink from "next/link";
import { LandingShell } from "@/components/docs/landing-shell";
import {
	Article,
	ArticleSection,
} from "@/components/landing/mailcheap/article";
import { articleGroups, siteLinks } from "@/components/landing/mailcheap/site";
import { getT } from "@/lib/i18n/server";
import { getImprint, IMPRINT_ROBOTS } from "@/lib/imprint";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Contact"),
		description: t("How to reach the people who build and run Reloop CRM."),
		robots: IMPRINT_ROBOTS,
	};
}

export default async function ContactPage() {
	const t = await getT();
	const links = siteLinks(t);
	const imprint = getImprint();
	const email = imprint?.email ?? null;

	const toc = [
		{ id: "issue", label: t("A bug or an idea") },
		{ id: "docs", label: t("A question about running it") },
		{ id: "email", label: t("Email") },
		{ id: "post", label: t("Postal address") },
	];

	return (
		<LandingShell>
			<Article
				groups={articleGroups(t, links)}
				current={links.contact.href}
				navLabel={t("Company")}
				toc={toc}
				tocLabel={t("On this page")}
				kicker={t("Our company")}
				title={t("Contact")}
				lede={
					<p>
						{t(
							"Reloop CRM is built in the open. Most questions are answered faster in the repository than in an inbox, because the answer stays there for the next person.",
						)}
					</p>
				}
			>
				<p>{t("Pick the channel that fits what you need.")}</p>

				<ArticleSection id="issue" title={t("A bug or an idea")}>
					<p>
						{t(
							"Open an issue in the repository. Write what you did, what you expected and what happened instead. Name the version you run. The version is on the status page of your install. A bug report with a version and a step list gets fixed. One without them gets questions.",
						)}
					</p>
					<p>
						<a href={links.github.href} target="_blank" rel="noreferrer">
							{t("Open an issue on GitHub")}
						</a>
					</p>
				</ArticleSection>

				<ArticleSection id="docs" title={t("A question about running it")}>
					<p>
						{t(
							"The docs cover the install, the update, the backup and the move to another domain. Read the guide first. It answers most of what a new install asks.",
						)}
					</p>
					<p>
						<NextLink href={links.docs.href}>{t("Read the docs")}</NextLink>
					</p>
				</ArticleSection>

				<ArticleSection id="email" title={t("Email")}>
					<p>
						{email
							? t(
									"Write to {email} for anything that does not belong in a public issue. That covers a question about your own data, a licence question, or press.",
									{ email },
								)
							: t(
									"No contact email is set for this installation. Use the issue tracker above for anything that does not belong in a public issue.",
								)}
					</p>
					<p>
						{email
							? t(
									"Report a security problem to {email}. Do not open a public issue for it. Describe the problem and how to reproduce it.",
									{ email },
								)
							: t(
									"Report a security problem through the repository instead of a public issue. Describe the problem and how to reproduce it.",
								)}
					</p>
				</ArticleSection>

				<ArticleSection id="post" title={t("Postal address")}>
					{imprint ? (
						<p>
							{t("The postal address is on the imprint page.")}{" "}
							<NextLink href={links.imprint.href}>
								{links.imprint.label}
							</NextLink>
						</p>
					) : (
						<p>{t("No postal address is set for this installation.")}</p>
					)}
				</ArticleSection>
			</Article>
		</LandingShell>
	);
}
