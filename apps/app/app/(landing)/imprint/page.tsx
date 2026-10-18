import { cn } from "@crm/ui/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingShell } from "@/components/docs/landing-shell";
import { ProsePage } from "@/components/site/prose";
import { SITE_TYPE } from "@/components/site/typography";
import { getT } from "@/lib/i18n/server";
import { getImprint, IMPRINT_ROBOTS } from "@/lib/imprint";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Imprint"),
		description: t(
			"Legal information under Section 5 of the German Digital Services Act (DDG).",
		),
		robots: IMPRINT_ROBOTS,
	};
}

export default async function ImprintPage() {
	const imprint = getImprint();
	if (!imprint) notFound();

	const t = await getT();

	const rows = [
		{ label: t("Name"), value: imprint.name },
		{ label: t("Business"), value: imprint.business },
		{
			label: t("Address"),
			value:
				imprint.addressLines.length > 0
					? imprint.addressLines.map((line) => (
							<span key={line} className="block">
								{line}
							</span>
						))
					: null,
		},
		{
			label: t("Email"),
			value: imprint.email ? (
				<a href={`mailto:${imprint.email}`}>{imprint.email}</a>
			) : null,
		},
		{ label: t("Phone"), value: imprint.phone },
		{ label: t("VAT ID"), value: imprint.vatId },
	].filter((row) => row.value);

	return (
		<LandingShell>
			<ProsePage
				eyebrow={t("Legal")}
				title={t("Imprint")}
				lede={t(
					"Legal information under Section 5 of the German Digital Services Act (DDG).",
				)}
			>
				<dl className="flex flex-col gap-6 border border-border p-6">
					{rows.map((row) => (
						<div key={row.label} className="flex flex-col gap-2">
							<dt className={cn(SITE_TYPE.mono, "text-(--ink-60)")}>
								{row.label}
							</dt>
							<dd className="text-foreground">{row.value}</dd>
						</div>
					))}
				</dl>
			</ProsePage>
		</LandingShell>
	);
}
