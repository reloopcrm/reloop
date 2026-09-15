import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { LandingShell } from "@/components/landing/landing-shell";
import { Markdown } from "@/components/landing/markdown";
import { REPO_URL } from "@/components/landing/site";

export const metadata: Metadata = {
	title: "Docs",
	description: "How to install, update and back up a self-hosted Reloop CRM.",
};

async function selfHostGuide(): Promise<string | null> {
	"use cache";
	cacheLife("max");
	try {
		return await readFile(
			join(process.cwd(), "..", "..", "docs", "self-host.md"),
			"utf8",
		);
	} catch {
		return null;
	}
}

export default async function DocsPage() {
	const guide = await selfHostGuide();

	return (
		<LandingShell>
			<main className="flex w-full max-w-(--container-page) flex-1 flex-col gap-6 px-6 py-10">
				{guide ? (
					<Markdown source={guide} />
				) : (
					<>
						<h1 className="font-medium text-3xl tracking-tight">Docs</h1>
						<p className="text-body-foreground text-sm/6">
							The self-host guide is not published yet.
						</p>
					</>
				)}

				<p className="text-muted-foreground text-sm/6">
					Everything else lives in the repository on{" "}
					<Link href={REPO_URL}>GitHub</Link>.
				</p>
			</main>
		</LandingShell>
	);
}
