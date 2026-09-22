export const USAGE_METER = { warnAt: 0.8 } as const;

export type MeterTone = "success" | "warning" | "destructive";

export function meterShare(used: number, limit: number): number {
	if (limit <= 0) return 100;
	return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

export function meterTone(used: number, limit: number): MeterTone {
	if (limit <= 0 || used >= limit) return "destructive";
	if (used / limit >= USAGE_METER.warnAt) return "warning";
	return "success";
}
