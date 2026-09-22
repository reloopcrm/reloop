import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { DOCS, docPath } from "@/components/landing/docs-config";
import {
	DocsHeading,
	DocsShell,
	readDoc,
} from "@/components/landing/docs-shell";
import { MarkdownBlocks, sliceBlocks } from "@/components/landing/markdown";
import { REPO_URL } from "@/components/landing/site";
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
	const { file, from, to } = DOCS.index.lede;
	const guide = await readDoc(file);
	const lede = guide ? sliceBlocks(guide, from, to) : [];

	return (
		<DocsShell current={DOCS.path}>
			<DocsHeading
				title={t(DOCS.index.title)}
				lede={t(DOCS.index.description)}
			/>

			{lede.length ? (
				<MarkdownBlocks blocks={lede} />
			) : (
				<p className="text-body-foreground text-sm/6">
					{t("The self-host guide is not published yet.")}
				</p>
			)}

			<ul className="flex flex-col gap-4 text-sm/6">
				{DOCS.pages.map((page) => (
					<li key={page.slug} className="flex flex-col text-foreground">
						<Link href={docPath(page.slug)}>{t(page.title)}</Link>
						<span className="text-muted-foreground">{t(page.description)}</span>
					</li>
				))}
			</ul>

			<p className="text-muted-foreground text-sm/6">
				{t("Everything else lives in the repository.")}{" "}
				<Link href={REPO_URL}>GitHub</Link>
			</p>
		</DocsShell>
	);
}
