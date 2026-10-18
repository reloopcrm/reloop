import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { Suspense } from "react";
import { getT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/session";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";

export default function IntakeConnectionPage(
	props: PageProps<"/[slug]/settings/connections/intake">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<IntakeConnectionPageContent {...props} />
		</Suspense>
	);
}

async function IntakeConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/intake">) {
	await requireSession();
	const [{ slug }, t] = await Promise.all([params, getT()]);

	return (
		<ConnectionPage centered className="max-w-(--container-narrow) text-center">
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<h1 className="font-medium text-2xl tracking-tight">{t("REST API")}</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{t(
						"Every action in the CRM is also a REST endpoint. Send an API key in the x-api-key header to /api/rest on this address.",
					)}
				</p>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{t(
						"GET /api/openapi.json lists every endpoint and every input. It needs the key too.",
					)}
				</p>
			</header>
			<div className="flex justify-center gap-2">
				<Button asChild>
					<Link href={`/${slug}/settings/api-keys`}>
						{t("Create an API key")}
					</Link>
				</Button>
				<Button asChild variant="outline">
					<Link href={`/${slug}/settings/connections`}>
						{t("Back to connections")}
					</Link>
				</Button>
			</div>
		</ConnectionPage>
	);
}
