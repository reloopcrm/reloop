import { z } from "zod";

export const trackingEventTypes = [
	"page_view",
	"click",
	"form_submit",
] as const;

export const trackingTouch = z.object({
	source: z.string().optional(),
	medium: z.string().optional(),
	campaign: z.string().optional(),
	term: z.string().optional(),
	content: z.string().optional(),
	referrer: z.string().optional(),
	landing: z.string().optional(),
	at: z.number().finite().optional(),
});

export const trackingEvent = z.object({
	type: z.enum(trackingEventTypes),
	host: z.string(),
	path: z.string(),
	referrer: z.string().optional(),
	label: z.string().optional(),
	at: z.number().finite().optional(),
	fields: z.record(z.string(), z.string()).optional(),
	touch: trackingTouch.optional().catch(undefined),
	firstTouch: trackingTouch.optional().catch(undefined),
});

export const trackingBatch = z.object({
	siteId: z.string(),
	visitorId: z.string(),
	events: z.array(z.unknown()).transform((items) =>
		items.flatMap((item) => {
			const parsed = trackingEvent.safeParse(item);

			return parsed.success ? [parsed.data] : [];
		}),
	),
});

export type TrackingTouch = z.infer<typeof trackingTouch>;
export type TrackingEvent = z.infer<typeof trackingEvent>;
export type TrackingBatch = z.output<typeof trackingBatch>;

export function parseTrackingBatch(raw: string): TrackingBatch | null {
	let json: unknown;

	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}

	const parsed = trackingBatch.safeParse(json);

	return parsed.success ? parsed.data : null;
}
