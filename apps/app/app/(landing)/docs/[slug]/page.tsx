import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AiAssistantsTabs } from "@/components/docs/ai-assistants-tabs";
import { DOCS, docPath } from "@/components/docs/docs-config";
import { DocsHeading, DocsShell, readDoc } from "@/components/docs/docs-shell";
import {
	MarkdownBlocks,
	outline,
	sliceBlocks,
} from "@/components/docs/markdown";
import { API_URL, isMarketing } from "@/lib/env";
import { getT } from "@/lib/i18n/server";

const AI_ASSISTANTS = {
	slug: "ai-assistants",
	settingsHref: "/settings/connections/ai",
	exampleAddress: "https://crm.example.com/api/mcp",
	path: "/api/mcp",
	serverName: "reloop",
	keyPlaceholder: "YOUR_KEY",
} as const;

function aiAssistantsProps() {
	const address = isMarketing()
		? AI_ASSISTANTS.exampleAddress
		: `${API_URL}${AI_ASSISTANTS.path}`;
	const add = `claude mcp add --transport http ${AI_ASSISTANTS.serverName} ${address}`;
	return {
		address,
		settingsHref: AI_ASSISTANTS.settingsHref,
		claudeCodeCommand: add,
		claudeCodeKeyCommand: `${add} --header "x-api-key: ${AI_ASSISTANTS.keyPlaceholder}"`,
		curlCommand: `curl -X POST ${address} -H "x-api-key: ${AI_ASSISTANTS.keyPlaceholder}" -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
	};
}

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
		<DocsShell current={docPath(page.slug)} outline={outline(blocks)}>
			<DocsHeading
				eyebrow={t(DOCS.index.title)}
				title={t(page.title)}
				lede={t(page.description)}
			/>
			{page.slug === AI_ASSISTANTS.slug ? (
				<AiAssistantsTabs {...aiAssistantsProps()} />
			) : null}
			<MarkdownBlocks blocks={blocks}>
				{blocks.length ? null : <p>{t("This page is not published yet.")}</p>}
			</MarkdownBlocks>
		</DocsShell>
	);
}
