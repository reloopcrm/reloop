import Script from "next/script";
import { BentoCard, CardHeading } from "./bento-card";
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

export function Faq({
	id,
	items,
	tone,
}: {
	id: string;
	items: readonly FaqItem[];
	tone?: Tone;
}) {
	return (
		<Band tone={tone}>
			<Script id={id} type="application/ld+json">
				{JSON.stringify(faqEntry(items))}
			</Script>
			<SectionHeading title="Questions people ask" />
			<div className="grid w-full gap-4 md:grid-cols-2">
				{items.map((item) => (
					<BentoCard key={item.question}>
						<CardHeading title={item.question} body={item.answer} />
					</BentoCard>
				))}
			</div>
		</Band>
	);
}
