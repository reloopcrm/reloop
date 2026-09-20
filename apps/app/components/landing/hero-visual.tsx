import {
	Evidence,
	EvidenceFooter,
	EvidenceQuote,
} from "@crm/ui/components/evidence";
import { Marker, MarkerContent } from "@crm/ui/components/marker";

const NUMBERS = [
	{ value: "13,688", label: "conversations read" },
	{ value: "181", label: "companies enriched" },
	{ value: "178", label: "people worth a new call" },
] as const;

const THREAD = [
	{
		subject: "Angebot Seefracht Rotterdam nach Shanghai",
		line: "Bitte um ein Angebot für zwei 40ft Container.",
		date: "12 Jan 2025",
	},
	{
		subject: "Re: Angebot Seefracht Rotterdam nach Shanghai",
		line: "Danke, wir melden uns nach der Messe.",
		date: "14 Feb 2025",
	},
] as const;

const FACTS = [
	{ label: "Last contact", value: "14 Feb 2025" },
	{ label: "Potential", value: "High" },
] as const;

export function HeroVisual() {
	return (
		<div className="w-full overflow-clip rounded-lg border border-border bg-card">
			<div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-border border-b px-5 py-4">
				{NUMBERS.map((number) => (
					<p className="flex items-baseline gap-2" key={number.label}>
						<span className="font-medium text-lg tabular-nums tracking-tight">
							{number.value}
						</span>
						<span className="text-muted-foreground text-xs">
							{number.label}
						</span>
					</p>
				))}
			</div>

			<div className="grid md:grid-cols-2">
				<section
					aria-label="A thread in the mailbox"
					className="flex min-w-0 flex-col gap-4 px-5 py-5"
				>
					<p className="text-muted-foreground text-xs">Mailbox</p>

					<ol className="flex flex-col gap-3">
						{THREAD.map((mail) => (
							<li
								className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted px-4 py-3"
								key={mail.subject}
							>
								<span className="flex items-baseline justify-between gap-3">
									<span className="min-w-0 truncate text-sm" lang="de">
										{mail.subject}
									</span>
									<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
										{mail.date}
									</span>
								</span>
								<span
									className="min-w-0 truncate text-muted-foreground text-sm"
									lang="de"
								>
									{mail.line}
								</span>
							</li>
						))}
					</ol>

					<Marker variant="separator">
						<MarkerContent>Quiet for 19 months</MarkerContent>
					</Marker>
				</section>

				<section
					aria-label="What Reloop CRM says about it"
					className="flex min-w-0 flex-col gap-4 border-border border-t px-5 py-5 md:border-t-0 md:border-l"
				>
					<p className="text-muted-foreground text-xs">Win back</p>

					<p className="text-pretty text-body-foreground text-sm/6">
						They asked for a sea freight quote, then went quiet after the fair.
						Nothing came back. Worth a new call.
					</p>

					<dl className="flex flex-col gap-2 text-sm">
						{FACTS.map((fact) => (
							<div
								className="flex items-baseline justify-between gap-3"
								key={fact.label}
							>
								<dt className="text-muted-foreground">{fact.label}</dt>
								<dd className="tabular-nums">{fact.value}</dd>
							</div>
						))}
					</dl>

					<Evidence>
						<EvidenceQuote lang="de">
							„Danke, wir melden uns nach der Messe.“
						</EvidenceQuote>
						<EvidenceFooter>
							<span className="tabular-nums">14 Feb 2025</span>
							<span className="min-w-0 truncate" lang="de">
								Re: Angebot Seefracht Rotterdam nach Shanghai
							</span>
						</EvidenceFooter>
					</Evidence>
				</section>
			</div>
		</div>
	);
}
