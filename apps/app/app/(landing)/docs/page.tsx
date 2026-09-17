import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { DOCS, docPath } from "@/components/landing/docs-config";
import { DocsShell, readDoc } from "@/components/landing/docs-shell";
import { MarkdownBlocks, sliceBlocks } from "@/components/landing/markdown";
import { REPO_URL } from "@/components/landing/site";

export const metadata: Metadata = {
	title: DOCS.index.title,
	description: DOCS.index.description,
};

export default async function DocsPage() {
	const { file, from, to } = DOCS.index.lede;
	const guide = await readDoc(file);
	const lede = guide ? sliceBlocks(guide, from, to) : [];

	return (
		<DocsShell current={DOCS.path}>
			<h1 className="font-medium text-3xl tracking-tight">
				{DOCS.index.title}
			</h1>

			{lede.length ? (
				<MarkdownBlocks blocks={lede} />
			) : (
				<p className="text-body-foreground text-sm/6">
					The self-host guide is not published yet.
				</p>
			)}

			<ul className="flex flex-col gap-4 text-sm/6">
				{DOCS.pages.map((page) => (
					<li key={page.slug} className="flex flex-col text-foreground">
						<Link href={docPath(page.slug)}>{page.title}</Link>
						<span className="text-muted-foreground">{page.description}</span>
					</li>
				))}
			</ul>

			<p className="text-muted-foreground text-sm/6">
				Everything else lives in the repository on{" "}
				<Link href={REPO_URL}>GitHub</Link>.
			</p>
		</DocsShell>
	);
}
