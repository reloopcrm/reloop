import {
	type EveToolFields,
	type EveToolInput,
	eveToolText,
} from "@crm/validation/eve-tool";
import type { Translate } from "./i18n/locale";

type ArtifactNames = Record<string, string>;

const ARTIFACT_NAMES: ArtifactNames = {
	"agent/instructions.md": "instructions",
	"agent/manifest.json": "the manifest",
	"agent/README.md": "the readme",
};

type LabelInput = {
	tool: string;
	input: EveToolInput;
	label: string;
	pending: boolean;
};

type ToolInputLabel = (
	input: EveToolFields,
	pending: boolean,
	t: Translate,
) => string | null;

type ToolInputLabels = Record<string, ToolInputLabel>;

const INPUT_LABELS: ToolInputLabels = {
	write_agent_file: (input, pending, t) => {
		const path = eveToolText.parse(input.path);
		if (!path) return null;
		const name = t(ARTIFACT_NAMES[path] ?? path);
		return pending
			? t("Writing {name}", { name })
			: t("Wrote {name}", { name });
	},
	save_agent_draft: (input, pending, t) => {
		const name = eveToolText.parse(input.name).trim();
		const verb = pending ? t("Saving draft") : t("Saved draft");
		return name ? `${verb} · ${name}` : verb;
	},
	set_chat_title: (input, pending, t) => {
		const title = eveToolText.parse(input.title).trim();
		const verb = pending ? t("Naming this chat") : t("Named this chat");
		return title ? `${verb} · ${title}` : verb;
	},
};

export function toolLabel(item: LabelInput, t: Translate): string {
	const fromInput = item.input
		? INPUT_LABELS[item.tool]?.(item.input, item.pending, t)
		: null;
	return fromInput ?? t(item.label);
}
