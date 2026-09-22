import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS, docPath } from "@/components/landing/docs-config";
import {
	DocsHeading,
	DocsShell,
	readDoc,
} from "@/components/landing/docs-shell";
import { MarkdownBlocks, sliceBlocks } from "@/components/landing/markdown";
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
		<DocsShell current={docPath(page.slug)}>
			<DocsHeading title={t(page.title)} lede={t(page.description)} />
			{blocks.length ? (
				<MarkdownBlocks blocks={blocks} />
			) : (
				<p className="text-body-foreground text-sm/6">
					{t("This page is not published yet.")}
				</p>
			)}
		</DocsShell>
	);
}
