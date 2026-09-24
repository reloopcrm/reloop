import ListChecked from "@carbon/icons-react/es/ListChecked";
import Pen from "@carbon/icons-react/es/Pen";
import View from "@carbon/icons-react/es/View";
import { Display } from "@crm/ui/components/display";
import type { Metadata } from "next";
import Image from "next/image";
import { HOME } from "@/components/landing/home/config";
import { MailboxPicker } from "@/components/landing/home/mailbox-picker";
import { LandingShell } from "@/components/landing/landing-shell";
import {
	Band,
	ClosingCta,
	PricingActions,
} from "@/components/landing/page-blocks";
import { SectionHeading } from "@/components/landing/section-heading";
import { StructuredData } from "@/components/landing/structured-data";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: {
			absolute: t("Reloop CRM: the open-source CRM that wins customers back"),
		},
		description: t(
			"Reloop CRM reads the mailbox you already have and shows which old customers are worth a call. Gmail, Outlook or any IMAP mailbox. Open source, on your own server.",
		),
		alternates: { canonical: "/" },
	};
}

export default async function Home() {
	const t = await getT();
	const locale = await getLocale();

	const heroVideo = locale === "de" ? HOME.heroVideo.de : HOME.heroVideo.en;
	const heroVideoLabel = t(
		"A recording of Reloop showing which old customers are worth a call.",
	);

	const numbers = [
		{ value: t("13,821"), label: t("Threads read") },
		{ value: t("15,885"), label: t("Messages") },
		{ value: t("2,691"), label: t("People") },
		{ value: t("2,537"), label: t("Companies") },
		{ value: t("64.5%"), label: t("of threads without value") },
	];

	const features = [
		{
			icon: View,
			title: t("Reads only. Never sends."),
			body: t("Reloop has read access only. No mail goes out without you."),
		},
		{
			icon: ListChecked,
			title: t("Value, point by point."),
			body: t("Every point stands on its own. You check it yourself."),
		},
		{
			icon: Pen,
			title: t("A draft, not a send."),
			body: t("Reloop writes the draft. Sending stays with you."),
		},
	];

	return (
		<LandingShell>
			<StructuredData />

			<section className="w-full px-6 py-12">
				<div className="mx-auto flex w-full max-w-(--container-page-wide) flex-col items-center gap-8 text-center">
					<Display size="hero" case="upper">
						{t("Win back old customers.")}
					</Display>
					<p className="max-w-(--container-sheet) text-pretty text-body-foreground text-lg md:text-xl">
						{t(
							"Reloop reads the mailbox you already have. And tells you which old customers you should call.",
						)}
					</p>
					<PricingActions />
				</div>
			</section>

			<Band className="pt-0 md:pt-0">
				<div className="w-full overflow-hidden rounded-lg border bg-card">
					<video
						key={heroVideo.src}
						width={HOME.heroVideo.width}
						height={HOME.heroVideo.height}
						className="block h-auto w-full motion-reduce:hidden"
						autoPlay
						muted
						loop
						playsInline
						preload="metadata"
						poster={heroVideo.poster}
						aria-label={heroVideoLabel}
					>
						<source src={heroVideo.src} type="video/mp4" />
					</video>
					<Image
						src={heroVideo.poster}
						alt={heroVideoLabel}
						width={HOME.heroVideo.width}
						height={HOME.heroVideo.height}
						className="hidden h-auto w-full motion-reduce:block"
					/>
				</div>
			</Band>

			<Band className="pt-0 md:pt-0">
				<div className="grid w-full items-center gap-10 rounded-lg bg-primary p-8 text-primary-foreground md:grid-cols-2 md:gap-16 md:p-10">
					<div className="flex flex-col gap-4">
						<h2 className="text-balance font-semibold text-4xl/[42px] tracking-tight">
							{t("Your mailbox is enough.")}
						</h2>
						<p className="text-lg">
							{t(
								"Reloop sends no mail. It reads along, scores every thread point by point and puts a draft in front of you. Sending stays with you.",
							)}
						</p>
					</div>
					<MailboxPicker t={t} />
				</div>
			</Band>

			<Band tone="secondary">
				<div className="flex w-full flex-col items-center gap-6 text-center">
					<Display size="section" asChild>
						<h2>{t("178 old customers. Worth a call.")}</h2>
					</Display>
					<p className="max-w-(--container-sheet) text-pretty text-body-foreground text-lg md:text-xl">
						{t(
							"Reloop shows you who is worth a call. Every point in the score has a reason.",
						)}
					</p>
				</div>
				<ul className="grid w-full grid-cols-1 gap-x-8 text-center lg:grid-cols-5">
					{numbers.map((number) => (
						<li key={number.label} className="py-6">
							<strong className="block font-semibold text-4xl text-foreground tabular-nums">
								{number.value}
							</strong>
							<span className="mt-2 block text-muted-foreground">
								{number.label}
							</span>
						</li>
					))}
				</ul>
			</Band>

			<Band>
				<SectionHeading title={t("It reads. You decide.")} />
				<div className="grid w-full gap-12 text-center md:grid-cols-3 md:gap-8">
					{features.map((feature) => (
						<div
							key={feature.title}
							className="flex flex-col items-center gap-2"
						>
							<feature.icon
								size={HOME.iconSize}
								className="text-body-foreground"
							/>
							<h3 className="pt-4 font-semibold text-foreground text-xl">
								{feature.title}
							</h3>
							<p className="text-muted-foreground">{feature.body}</p>
						</div>
					))}
				</div>
			</Band>

			<ClosingCta
				title={t("Try it on your own mailbox.")}
				lede={t("14 days free, no card. From 39 € a month after that.")}
				tone="secondary"
			/>
		</LandingShell>
	);
}
