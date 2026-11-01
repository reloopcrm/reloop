import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS, docPath } from "@/components/docs/docs-config";
import { readDoc } from "@/components/docs/docs-shell";
import { LandingShell } from "@/components/docs/landing-shell";
import { outline, sliceBlocks } from "@/components/docs/markdown";
import { AssistantSetup } from "@/components/landing/mailcheap/assistants";
import { LANDING } from "@/components/landing/mailcheap/config";
import {
	DocsArticle,
	markdownLabels,
} from "@/components/landing/mailcheap/docs";
import { SiteMarkdown } from "@/components/landing/mailcheap/markdown";
import { getT } from "@/lib/i18n/server";

type Params = Promise<{ slug: string }>;

function pageFor(slug: string) {
	const page = DOCS.pages.find((candidate) => candidate.slug === slug);
	if (!page) notFound();
	return page;
}

export function generateStaticParams() {
	return DOCS.pages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const page = pageFor((await params).slug);
	const t = await getT();
	return { title: t(page.title), description: t(page.description) };
}

export default async function DocPage({ params }: { params: Params }) {
	const page = pageFor((await params).slug);
	const t = await getT();
	const source = await readDoc(page.file);
	const blocks = source ? sliceBlocks(source, page.from, page.to) : [];

	return (
		<LandingShell>
			<DocsArticle
				t={t}
				current={docPath(page.slug)}
				outline={outline(blocks)}
				title={t(page.title)}
				lede={<p>{t(page.description)}</p>}
			>
				{page.slug === LANDING.docs.assistants ? (
					<AssistantSetup t={t} />
				) : null}
				{blocks.length ? (
					<SiteMarkdown blocks={blocks} labels={markdownLabels(t)} />
				) : (
					<p>{t("This page is not published yet.")}</p>
				)}
			</DocsArticle>
		</LandingShell>
	);
}
