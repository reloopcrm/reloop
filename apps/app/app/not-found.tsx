import "@crm/ui/site.css";
import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import NextLink from "next/link";
import { LandingShell } from "@/components/docs/landing-shell";
import { Eyebrow } from "@/components/site/eyebrow";
import { SITE_FONTS } from "@/components/site/fonts";
import { Section } from "@/components/site/section";
import { SITE_TYPE } from "@/components/site/typography";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
	const t = await getT();

	return (
		<div className={cn(SITE_FONTS, "contents")}>
			<LandingShell>
				<Section corners="blue" className="flex grow flex-col justify-center">
					<div className="flex flex-col items-center gap-6 text-center">
						<Eyebrow>404</Eyebrow>
						<h1 className={cn(SITE_TYPE.display2, "max-w-160 text-balance")}>
							{t("This page does not exist")}
						</h1>
						<p className={cn(SITE_TYPE.lede, "max-w-150 text-pretty")}>
							{t("The address is wrong, or the page moved.")}
						</p>
						<div className="mt-2 flex flex-wrap justify-center gap-2">
							<Button asChild>
								<NextLink href="/">{t("Go to the home page")}</NextLink>
							</Button>
							<Button variant="outline" asChild>
								<NextLink href="/docs">{t("Read the docs")}</NextLink>
							</Button>
						</div>
						<p className="flex flex-wrap justify-center gap-4 text-(--ink-60) text-(length:--site-text-small)">
							<NextLink href="/sitemap.xml" className={SITE_TYPE.link}>
								{t("Sitemap")}
							</NextLink>
							<NextLink href="/llms.txt" className={SITE_TYPE.link}>
								{"llms.txt"}
							</NextLink>
						</p>
					</div>
				</Section>
			</LandingShell>
		</div>
	);
}
