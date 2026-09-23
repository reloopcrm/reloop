import { Button } from "@crm/ui/components/button";
import { Display } from "@crm/ui/components/display";
import { Link } from "@crm/ui/components/link";
import NextLink from "next/link";
import { LandingShell } from "@/components/landing/landing-shell";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
	const t = await getT();

	return (
		<LandingShell>
			<section className="flex w-full grow flex-col items-center justify-center gap-10 px-6 pt-20 pb-24 md:pt-24 md:pb-32">
				<div className="flex w-full max-w-(--container-page) flex-col items-center gap-6 text-center">
					<p className="font-mono text-muted-foreground text-sm">404</p>
					<Display size="section" asChild>
						<h1>{t("This page does not exist")}</h1>
					</Display>
					<p className="max-w-(--container-sheet) text-pretty text-body-foreground text-lg md:text-2xl">
						{t("The address is wrong, or the page moved.")}
					</p>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-4">
					<Button variant="outline" size="xl" asChild>
						<NextLink href="/">{t("Go to the home page")}</NextLink>
					</Button>
					<Button variant="link" asChild>
						<NextLink href="/docs">{t("Read the docs")}</NextLink>
					</Button>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-4 text-2sm">
					<Link variant="quiet" href="/sitemap.xml">
						{t("Sitemap")}
					</Link>
					<Link variant="quiet" href="/llms.txt">
						{"llms.txt"}
					</Link>
				</div>
			</section>
		</LandingShell>
	);
}
