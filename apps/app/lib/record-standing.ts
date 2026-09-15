export const RECORD_STANDINGS = ["customer", "interested", "watch"] as const;

export type RecordStanding = (typeof RECORD_STANDINGS)[number];

export const RECORD_POTENTIALS = ["high", "medium", "low"] as const;

export type RecordPotential = (typeof RECORD_POTENTIALS)[number];

const STANDING_LABEL = {
	customer: "Customer",
	interested: "Interested",
	watch: "Watch",
} satisfies Record<RecordStanding, string>;

const POTENTIAL_PRESENTATION = {
	high: { label: "High", text: "text-foreground" },
	medium: { label: "Medium", text: "text-muted-foreground" },
	low: { label: "Low", text: "text-faint-foreground" },
} satisfies Record<RecordPotential, { label: string; text: string }>;

export const STANDING_FACET_OPTIONS = RECORD_STANDINGS.map((value) => ({
	value,
	label: STANDING_LABEL[value],
}));

export const POTENTIAL_FACET_OPTIONS = RECORD_POTENTIALS.map((value) => ({
	value,
	label: POTENTIAL_PRESENTATION[value].label,
}));

export function standingLabel(standing: RecordStanding): string {
	return STANDING_LABEL[standing];
}

export function potentialPresentation(potential: RecordPotential) {
	return POTENTIAL_PRESENTATION[potential];
}
