import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingShell } from "@/components/docs/landing-shell";
import { Article } from "@/components/landing/mailcheap/article";
import { articleGroups, siteLinks } from "@/components/landing/mailcheap/site";
import { getT } from "@/lib/i18n/server";
import { getImprint, IMPRINT_ROBOTS } from "@/lib/imprint";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Imprint"),
		description: t(
			"Legal information under Section 5 of the German Digital Services Act (DDG).",
		),
		robots: IMPRINT_ROBOTS,
	};
}

export default async function ImprintPage() {
	const imprint = getImprint();
	if (!imprint) notFound();

	const t = await getT();
	const links = siteLinks(t);

	const fields = [
		{ label: t("Name"), lines: [imprint.name] },
		{
			label: t("Business"),
			lines: imprint.business ? [imprint.business] : [],
		},
		{ label: t("Address"), lines: imprint.addressLines },
		{
			label: t("Email"),
			lines: imprint.email ? [imprint.email] : [],
			href: imprint.email ? `mailto:${imprint.email}` : undefined,
		},
		{ label: t("Phone"), lines: imprint.phone ? [imprint.phone] : [] },
		{ label: t("VAT ID"), lines: imprint.vatId ? [imprint.vatId] : [] },
	].filter((field) => field.lines.length > 0);

	return (
		<LandingShell>
			<Article
				groups={articleGroups(t, links)}
				current={links.imprint.href}
				navLabel={t("Company")}
				kicker={t("Legal")}
				title={t("Imprint")}
				lede={
					<p>
						{t(
							"Legal information under Section 5 of the German Digital Services Act (DDG).",
						)}
					</p>
				}
			>
				<section className="mc-card mc-annex">
					<dl className="mc-annex-fields">
						{fields.map((field) => (
							<div key={field.label} className="mc-annex-field">
								<dt>{field.label}</dt>
								<dd>
									{field.lines.map((line) => (
										<p key={line}>
											{field.href ? <a href={field.href}>{line}</a> : line}
										</p>
									))}
								</dd>
							</div>
						))}
					</dl>
				</section>
			</Article>
		</LandingShell>
	);
}
