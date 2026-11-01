import { cn } from "@crm/ui/lib/utils";
import NextLink from "next/link";
import { LandingShell } from "@/components/docs/landing-shell";
import { Actions, PageHero } from "@/components/landing/mailcheap/parts";
import { SITE_FONTS } from "@/components/site/fonts";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
	const t = await getT();

	return (
		<div className={cn(SITE_FONTS, "contents")}>
			<LandingShell>
				<PageHero
					kicker="404"
					title={t("This page does not exist")}
					lede={<p>{t("The address is wrong, or the page moved.")}</p>}
					note={
						<>
							<NextLink href="/sitemap.xml">{t("Sitemap")}</NextLink>{" "}
							<NextLink href="/llms.txt">{"llms.txt"}</NextLink>
						</>
					}
				>
					<Actions
						primary={{ href: "/", label: t("Go to the home page") }}
						secondary={{ href: "/docs", label: t("Read the docs") }}
					/>
				</PageHero>
			</LandingShell>
		</div>
	);
}
