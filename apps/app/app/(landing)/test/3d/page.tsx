import { LOCALE } from "@crm/db/locale";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import { Display } from "@crm/ui/components/display";
import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";
import { Band, ClosingCta } from "@/components/landing/page-blocks";
import { dateFormat, numberFormat } from "@/lib/i18n/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { MAIL } from "./config";
import { CountUp, type SceneMail, type SceneRow, WinBackScene } from "./scene";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Win back old customers."),
		description: t(
			"Reloop reads the mailbox you already have. And tells you which old customers you should call.",
		),
		robots: { index: false, follow: false },
	};
}

export default async function WinBackTestPage() {
	const t = await getT();
	const locale = await getLocale();
	const tag = LOCALE.tags[locale];
	const points = DEFAULT_WIN_BACK_RULES.points;
	const month = dateFormat(locale, { month: "short", year: "numeric" });

	const subjects = [
		t("Re: Your quote"),
		t("Invoice"),
		t("Quick question"),
		t("Inquiry"),
		t("Re: Order"),
		t("Meeting next week"),
		t("Price list"),
		t("Following up on the offer"),
	];

	const mails: SceneMail[] = MAIL.dates.map((date, index) => ({
		id: date,
		provider: index % 3 === 1 ? "microsoft" : "google",
		providerName: index % 3 === 1 ? "Outlook" : "Gmail",
		subject: subjects[index % subjects.length] ?? "",
		date: month.format(new Date(date)),
		senderWidth: MAIL.senderWidths[index % MAIL.senderWidths.length] ?? "",
		previewWidth: MAIL.previewWidths[index % MAIL.previewWidths.length] ?? "",
	}));

	const pastBusiness = { label: t("1 deal done"), points: points.pastBusiness };
	const openInquiry = {
		label: t("1 open inquiry"),
		points: points.openInquiry,
	};
	const waitingOnUs = {
		label: t("Waiting on your reply"),
		points: points.waitingOnUs,
	};
	const bigQuantity = {
		label: t("{count} {unit} asked", {
			count: numberFormat(locale).format(500),
			unit: t("units"),
		}),
		points: points.bigQuantity,
	};
	const openDeal = {
		label: t("{n} open deal", { n: 1 }),
		points: points.openDeal,
	};
	const goodFeedback = { label: t("Worth it"), points: points.goodFeedback };

	const reasonSets = [
		[pastBusiness, openInquiry, waitingOnUs],
		[openInquiry, bigQuantity],
		[pastBusiness, openDeal],
		[goodFeedback, waitingOnUs],
	];

	const rows: SceneRow[] = reasonSets.map((reasons, index) => ({
		id: String(index),
		potential: index < 2 ? t("High") : t("Medium"),
		strong: index < 2,
		reasons,
		total: reasons.reduce((sum, reason) => sum + reason.points, 0),
	}));

	const numbers = [
		{ value: 13821, text: t("13,821"), label: t("Threads read") },
		{ value: 15885, text: t("15,885"), label: t("Messages") },
		{ value: 2691, text: t("2,691"), label: t("People") },
		{ value: 2537, text: t("2,537"), label: t("Companies") },
	];

	return (
		<LandingShell>
			<WinBackScene
				hero={{
					title: t("Win back old customers."),
					lede: t(
						"Reloop reads the mailbox you already have. And tells you which old customers you should call.",
					),
				}}
				caption={t(
					"Reloop shows you who is worth a call. Every point in the score has a reason.",
				)}
				columns={{
					company: t("Company"),
					potential: t("Potential"),
					reasons: t("What happened"),
					points: t("Points"),
				}}
				callFirst={t("Call first")}
				mails={mails}
				rows={rows}
			/>

			<Band tone="secondary">
				<ul className="grid w-full grid-cols-2 gap-x-8 gap-y-4 text-center lg:grid-cols-4">
					{numbers.map((number) => (
						<li key={number.label} className="py-6">
							<CountUp
								value={number.value}
								text={number.text}
								tag={tag}
								className="block font-semibold text-4xl text-foreground tabular-nums md:text-5xl"
							/>
							<span className="mt-2 block text-muted-foreground">
								{number.label}
							</span>
						</li>
					))}
				</ul>
			</Band>

			<Band>
				<div className="grid w-full gap-12 text-center md:grid-cols-2">
					<div className="flex flex-col items-center gap-3">
						<Display size="section" asChild>
							<CountUp
								value={64.5}
								decimals={1}
								percent
								text={t("64.5%")}
								tag={tag}
							/>
						</Display>
						<span className="text-body-foreground text-lg">
							{t("of threads without value")}
						</span>
					</div>
					<div className="flex flex-col items-center gap-3">
						<Display size="section" asChild>
							<CountUp
								value={178}
								text={numberFormat(locale).format(178)}
								tag={tag}
							/>
						</Display>
						<span className="text-body-foreground text-lg">
							{t("old customers. Worth a call.")}
						</span>
					</div>
				</div>
			</Band>

			<Band tone="secondary">
				<ul className="grid w-full gap-8 text-center md:grid-cols-3">
					{[
						t("Reads only. Never sends."),
						t("A draft, not a send."),
						t("Open source under the AGPL."),
					].map((line) => (
						<li key={line} className="font-semibold text-foreground text-xl">
							{line}
						</li>
					))}
				</ul>
			</Band>

			<ClosingCta title={t("Try it on your own mailbox.")} />
		</LandingShell>
	);
}
