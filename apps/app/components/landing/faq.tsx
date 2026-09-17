import Script from "next/script";
import { BentoCard, CardHeading } from "./bento-card";
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

export function Faq({ id, items }: { id: string; items: readonly FaqItem[] }) {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center px-6 pb-20 md:pb-30">
			<Script id={id} type="application/ld+json">
				{JSON.stringify(faqEntry(items))}
			</Script>
			<div className="flex w-full max-w-6xl flex-col gap-12">
				<SectionHeading title="Questions people ask" />
				<div className="grid gap-4 md:grid-cols-2">
					{items.map((item) => (
						<BentoCard key={item.question}>
							<CardHeading title={item.question} body={item.answer} />
						</BentoCard>
					))}
				</div>
			</div>
		</section>
	);
}
