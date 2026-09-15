import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";
import { MIT_LICENSE } from "@/lib/license";

export const metadata: Metadata = {
	title: "Open source",
	description: "The licence Reloop CRM is built on.",
};

export default function OpenSourcePage() {
	return (
		<LandingShell>
			<main className="mx-auto flex w-full max-w-(--container-page) flex-1 flex-col gap-6 px-6 py-10">
				<h1 className="font-medium text-3xl tracking-tight">Open source</h1>

				<p className="text-body-foreground text-sm/6">
					Reloop CRM is free software under the GNU Affero General Public
					License, version 3. It is derived from Comp AI CRM. The MIT licence of
					that project is below. It stays valid, and its copyright notice stays
					in place.
				</p>

				<p className="text-body-foreground text-sm/6">
					Every library in this product carries its own licence. Almost all of
					them are MIT, ISC or Apache 2.0. Each licence text ships inside the
					package it belongs to.
				</p>

				<pre className="overflow-x-auto rounded-lg border border-border bg-card p-6 font-mono text-muted-foreground text-xs/5">
					{MIT_LICENSE}
				</pre>

				<p className="text-muted-foreground text-sm/6">
					<Link variant="quiet" href="/">
						Back to the start page
					</Link>
				</p>
			</main>
		</LandingShell>
	);
}
