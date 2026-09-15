import { numberFormat } from "@/lib/i18n/format";
import type { Locale, Translate } from "@/lib/i18n/locale";
import type { RouterOutputs } from "@/lib/trpc/types";

type Group = RouterOutputs["reactivation"]["list"]["rows"][number];

export type WinBackFacts = Pick<Group, "waitingOnUs" | "memory">;

export function shortFact(
	source: WinBackFacts,
	t: Translate,
	locale: Locale,
): string {
	const memory = source.memory;
	const amount = (value: number) => numberFormat(locale).format(value);

	if (memory.didBusiness > 0) {
		return memory.didBusiness === 1
			? t("1 deal")
			: t("{count} deals", { count: amount(memory.didBusiness) });
	}
	if (memory.maxPallets !== null) {
		return t("{count} units asked", { count: amount(memory.maxPallets) });
	}
	if (memory.openInquiries > 0) {
		return memory.openInquiries === 1
			? t("1 open inquiry")
			: t("{count} open inquiries", { count: amount(memory.openInquiries) });
	}
	if (source.waitingOnUs) return t("Waiting on your reply");
	if (memory.products.length > 0) return memory.products[0] ?? "";
	if (memory.threadsRead === 0) return t("Not read yet");

	return t("Nothing about the business yet");
}

function factLine(source: WinBackFacts, t: Translate, locale: Locale): string {
	const parts: string[] = [];
	const memory = source.memory;

	if (memory.didBusiness > 0) {
		parts.push(
			memory.didBusiness === 1
				? t("1 deal done")
				: t("{count} deals done", { count: memory.didBusiness }),
		);
	}
	if (memory.openInquiries > 0) {
		parts.push(
			memory.openInquiries === 1
				? t("1 open inquiry")
				: t("{count} open inquiries", { count: memory.openInquiries }),
		);
	}
	if (memory.maxPallets !== null) {
		parts.push(
			t("up to {count} units", {
				count: numberFormat(locale).format(memory.maxPallets),
			}),
		);
	}
	if (source.waitingOnUs) parts.push(t("Waiting on your reply"));
	if (memory.products.length > 0) {
		parts.push(memory.products.slice(0, 3).join(", "));
	}
	if (parts.length === 0 && memory.threadsRead === 0) {
		return t("Conversations not read yet");
	}

	return parts.join(" · ") || t("Nothing about the business yet");
}

export function factTitle(
	source: WinBackFacts,
	t: Translate,
	locale: Locale,
): string {
	const summary = source.memory.summary;
	const line = factLine(source, t, locale);

	return summary ? `${line}\n${summary}` : line;
}
