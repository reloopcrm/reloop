import { EMAIL_DRAFT } from "@/components/crm/email-draft-config";
import { TIMELINE } from "./timeline-config";

export type ForwardLines = {
	subject: string;
	intro: string[];
	text: string;
};

function quoted(text: string): string {
	return text
		.split("\n")
		.map((line) => (line.length > 0 ? `> ${line}` : ">"))
		.join("\n");
}

function href(lines: ForwardLines, text: string): string {
	const body = ["", ...lines.intro, "", quoted(text)].join("\n");

	return `mailto:?subject=${encodeURIComponent(lines.subject)}&body=${encodeURIComponent(body)}`;
}

export function forwardLink(lines: ForwardLines): string {
	const full = lines.text.trim();
	let head = full.slice(0, TIMELINE.forward.headChars);

	for (;;) {
		const cut = head.length < full.length;
		const link = href(lines, cut ? `${head.trimEnd()}…` : head);
		if (link.length <= EMAIL_DRAFT.mailtoMaxChars || head.length === 0) {
			return link;
		}
		head = head.slice(0, Math.max(0, head.length - TIMELINE.forward.stepChars));
	}
}
