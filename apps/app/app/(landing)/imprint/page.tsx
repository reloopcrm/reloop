import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingShell } from "@/components/landing/landing-shell";
import { Band, PageHero, Prose } from "@/components/landing/page-blocks";
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

	return (
		<LandingShell>
			<PageHero
				title={t("Imprint")}
				size="title"
				lede={t(
					"Legal information under Section 5 of the German Digital Services Act (DDG).",
				)}
				actions={null}
			/>

			<Band tone="secondary">
				<Prose>
					<dl className="flex w-full flex-col gap-6 rounded-lg border border-border bg-card p-6 text-base">
						<div className="flex flex-col gap-1">
							<dt className="text-muted-foreground text-xs/5">{t("Name")}</dt>
							<dd className="text-foreground">{imprint.name}</dd>
						</div>

						{imprint.business ? (
							<div className="flex flex-col gap-1">
								<dt className="text-muted-foreground text-xs/5">
									{t("Business")}
								</dt>
								<dd className="text-foreground">{imprint.business}</dd>
							</div>
						) : null}

						{imprint.addressLines.length > 0 ? (
							<div className="flex flex-col gap-1">
								<dt className="text-muted-foreground text-xs/5">
									{t("Address")}
								</dt>
								<dd className="text-foreground">
									{imprint.addressLines.map((line) => (
										<span key={line} className="block">
											{line}
										</span>
									))}
								</dd>
							</div>
						) : null}

						{imprint.email ? (
							<div className="flex flex-col gap-1">
								<dt className="text-muted-foreground text-xs/5">
									{t("Email")}
								</dt>
								<dd className="text-foreground">
									<Link variant="quiet" href={`mailto:${imprint.email}`}>
										{imprint.email}
									</Link>
								</dd>
							</div>
						) : null}

						{imprint.phone ? (
							<div className="flex flex-col gap-1">
								<dt className="text-muted-foreground text-xs/5">
									{t("Phone")}
								</dt>
								<dd className="text-foreground">{imprint.phone}</dd>
							</div>
						) : null}

						{imprint.vatId ? (
							<div className="flex flex-col gap-1">
								<dt className="text-muted-foreground text-xs/5">
									{t("VAT ID")}
								</dt>
								<dd className="text-foreground">{imprint.vatId}</dd>
							</div>
						) : null}
					</dl>
				</Prose>
			</Band>
		</LandingShell>
	);
}
