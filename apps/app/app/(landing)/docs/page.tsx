import type { Metadata } from "next";
import NextLink from "next/link";
import { DOCS, docPath } from "@/components/docs/docs-config";
import { readDoc } from "@/components/docs/docs-shell";
import { LandingShell } from "@/components/docs/landing-shell";
import { sliceBlocks } from "@/components/docs/markdown";
import {
	DocsArticle,
	markdownLabels,
} from "@/components/landing/mailcheap/docs";
import { SiteMarkdown } from "@/components/landing/mailcheap/markdown";
import { siteLinks } from "@/components/landing/mailcheap/site";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t(DOCS.index.title),
		description: t(DOCS.index.description),
	};
}

export default async function DocsPage() {
	const t = await getT();
	const links = siteLinks(t);
	const { file, from, to } = DOCS.index.lede;
	const guide = await readDoc(file);
	const lede = guide ? sliceBlocks(guide, from, to) : [];

	return (
		<LandingShell>
			<DocsArticle
				t={t}
				current={DOCS.path}
				title={t(DOCS.index.title)}
				lede={<p>{t(DOCS.index.description)}</p>}
			>
				{lede.length ? (
					<SiteMarkdown blocks={lede} labels={markdownLabels(t)} />
				) : (
					<p>{t("The self-host guide is not published yet.")}</p>
				)}
				<ul className="mc-doc-list">
					{DOCS.pages.map((page) => (
						<li key={page.slug}>
							<NextLink href={docPath(page.slug)} className="mc-card">
								<h3>{t(page.title)}</h3>
								<div className="mc-card-body">
									<p>{t(page.description)}</p>
								</div>
							</NextLink>
						</li>
					))}
				</ul>
				<p>
					{t("Everything else lives in the repository.")}{" "}
					<a href={links.github.href} target="_blank" rel="noreferrer">
						{links.github.label}
					</a>
				</p>
			</DocsArticle>
		</LandingShell>
	);
}
