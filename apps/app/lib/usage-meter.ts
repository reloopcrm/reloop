export type UsageLevel = "normal" | "warning" | "reached";

export type MeterTone = "success" | "warning" | "destructive";

const TONE_OF = {
	normal: "success",
	warning: "warning",
	reached: "destructive",
} as const satisfies Record<UsageLevel, MeterTone>;

export function meterShare(used: number, limit: number): number {
	if (limit <= 0) return 100;
	return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

export function meterTone(level: UsageLevel): MeterTone {
	return TONE_OF[level];
}
