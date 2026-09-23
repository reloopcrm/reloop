import Script from "next/script";
import { getT } from "@/lib/i18n/server";
import { Band, type Tone } from "./page-blocks";
import { SectionHeading } from "./section-heading";

export type FaqItem = { question: string; answer: string };

function faqEntry(items: readonly FaqItem[]) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: { "@type": "Answer", text: item.answer },
		})),
	};
}

export async function Faq({
	id,
	items,
	tone,
}: {
	id: string;
	items: readonly FaqItem[];
	tone?: Tone;
}) {
	const t = await getT();
	return (
		<Band tone={tone}>
			<Script id={id} type="application/ld+json">
				{JSON.stringify(faqEntry(items))}
			</Script>
			<SectionHeading title={t("Questions people ask")} />
			<dl className="flex w-full max-w-(--container-page) flex-col">
				{items.map((item) => (
					<div
						key={item.question}
						className="flex flex-col gap-2 border-border border-b py-6 first:pt-0 last:border-b-0 last:pb-0 md:grid md:grid-cols-2 md:gap-8"
					>
						<dt className="text-balance font-semibold text-foreground text-xl">
							{item.question}
						</dt>
						<dd className="text-body-foreground text-base/7">{item.answer}</dd>
					</div>
				))}
			</dl>
		</Band>
	);
}
