import { Button } from "@crm/ui/components/button";
import { Link } from "@crm/ui/components/link";
import NextLink from "next/link";
import { LandingShell } from "@/components/landing/landing-shell";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
	const t = await getT();

	return (
		<LandingShell>
			<section className="flex w-full grow flex-col items-center justify-center gap-7 px-6 py-20">
				<div className="flex w-full max-w-(--container-sheet) flex-col items-center gap-4">
					<p className="font-mono text-muted-foreground text-sm">404</p>

					<h1 className="text-balance text-center font-semibold text-4xl/[42px] tracking-tight md:text-[44px]/[50px]">
						{t("This page does not exist")}
					</h1>

					<p className="text-pretty text-center text-lg/[28px] text-muted-foreground">
						{t("The address is wrong, or the page moved.")}
					</p>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-3">
					<Button size="xl" asChild>
						<NextLink href="/">{t("Go to the home page")}</NextLink>
					</Button>

					<Button variant="outline" size="xl" asChild>
						<NextLink href="/docs">{t("Read the docs")}</NextLink>
					</Button>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-4 text-[13px]/[21px]">
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
