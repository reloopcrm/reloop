import { Link } from "@crm/ui/components/link";
import { cn } from "@crm/ui/lib/utils";
import type { Metadata } from "next";
import NextLink from "next/link";
import { DOCS, docPath } from "@/components/docs/docs-config";
import { DocsHeading, DocsShell, readDoc } from "@/components/docs/docs-shell";
import { MarkdownBlocks, sliceBlocks } from "@/components/docs/markdown";
import { REPO_URL } from "@/components/site";
import { Square } from "@/components/site/eyebrow";
import { SITE_TYPE } from "@/components/site/typography";
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

			<MarkdownBlocks blocks={lede}>
				{lede.length ? null : (
					<p>{t("The self-host guide is not published yet.")}</p>
				)}

				<ul className="grid grid-cols-2 gap-4 pt-4 max-[900px]:grid-cols-1">
					{DOCS.pages.map((page) => (
						<li key={page.slug} className="flex">
							<NextLink
								href={docPath(page.slug)}
								className="grid w-full grid-cols-[--spacing(2)_1fr] items-start gap-4 border border-border bg-background pt-5 pe-6 pb-5.5 ps-5 no-underline outline-none transition-colors duration-400 ease-(--site-ease) hover:bg-(--active) focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								<span className="mt-1.5 flex">
									<Square />
								</span>
								<span className="grid gap-2">
									<span className={cn(SITE_TYPE.title20, "text-foreground")}>
										{t(page.title)}
									</span>
									<span className="text-(--ink-70) text-(length:--site-text-small) leading-(--site-leading-body)">
										{t(page.description)}
									</span>
								</span>
							</NextLink>
						</li>
					))}
				</ul>

				<p>
					{t("Everything else lives in the repository.")}{" "}
					<Link href={REPO_URL}>GitHub</Link>
				</p>
			</MarkdownBlocks>
		</DocsShell>
	);
}
