import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";
import {
	Band,
	CloudBanner,
	PageHero,
	Prose,
} from "@/components/landing/page-blocks";
import { getT } from "@/lib/i18n/server";
import { MIT_LICENSE } from "@/lib/license";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Open source"),
		description: t("The licence Reloop CRM is built on."),
	};
}

export default async function OpenSourcePage() {
	const t = await getT();

	return (
		<LandingShell>
			<PageHero
				title={t("Open source")}
				size="title"
				lede={t(
					"Reloop CRM is free software under the GNU Affero General Public License, version 3. It is derived from Comp AI CRM.",
				)}
				actions={null}
			/>

			<CloudBanner />

			<Band tone="secondary">
				<Prose>
					<p>
						{t(
							"The MIT licence of Comp AI CRM is below. It stays valid, and its copyright notice stays in place.",
						)}
					</p>

					<p>
						{t(
							"Every library in this product carries its own licence. Almost all of them are MIT, ISC or Apache 2.0. Each licence text ships inside the package it belongs to.",
						)}
					</p>

					<pre className="overflow-x-auto rounded-lg border border-border bg-card p-6 font-mono text-muted-foreground text-xs/5">
						{MIT_LICENSE}
					</pre>
				</Prose>
			</Band>
		</LandingShell>
	);
}
