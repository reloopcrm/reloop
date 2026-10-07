import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";

const EVENTS_URL =
	"https://www.googleapis.com/calendar/v3/calendars/primary/events";

const googleEventTime = z.object({
	dateTime: z.string().optional(),
	date: z.string().optional(),
	timeZone: z.string().optional(),
});

export type GoogleEventTime = z.infer<typeof googleEventTime>;

const googlePerson = z.object({
	email: z.string().optional(),
	displayName: z.string().optional(),
	self: z.boolean().optional(),
});

export const googleEvent = z.object({
	id: z.string().optional(),
	iCalUID: z.string().optional(),
	status: z.string().optional(),
	summary: z.string().optional(),
	description: z.string().optional(),
	location: z.string().optional(),
	hangoutLink: z.string().optional(),
	htmlLink: z.string().optional(),
	recurringEventId: z.string().optional(),
	start: googleEventTime.optional(),
	end: googleEventTime.optional(),
	originalStartTime: googleEventTime.optional(),
	organizer: googlePerson.optional(),
	creator: googlePerson.optional(),
	attendees: z
		.array(
			googlePerson.extend({
				responseStatus: z.string().optional(),
				organizer: z.boolean().optional(),
				resource: z.boolean().optional(),
			}),
		)
		.optional(),
	conferenceData: z
		.object({
			entryPoints: z
				.array(
					z.object({
						entryPointType: z.string().optional(),
						uri: z.string().optional(),
					}),
				)
				.optional(),
		})
		.optional(),
});

export type GoogleEvent = z.infer<typeof googleEvent>;

export const googleEventsPage = z.object({
	items: z.array(googleEvent).optional(),
	nextPageToken: z.string().optional(),
	nextSyncToken: z.string().optional(),
});

export type EventsPage = z.infer<typeof googleEventsPage>;

export type EventsQuery = {
	syncToken?: string;
	timeMin?: string;
	timeMax?: string;
	pageToken?: string;
	maxResults?: number;
};

@Injectable()
export class CalendarClient {
	constructor(private readonly api: MailboxApiClient) {}

	async listEvents(
		accessToken: string,
		query: EventsQuery,
	): Promise<MailboxResult<EventsPage>> {
		const window = query.syncToken
			? {}
			: { timeMin: query.timeMin, timeMax: query.timeMax };

		return this.api.get(EVENTS_URL, accessToken, googleEventsPage, {
			singleEvents: true,
			showDeleted: true,
			maxResults: query.maxResults ?? 250,
			syncToken: query.syncToken,
			pageToken: query.pageToken,
			...window,
		});
	}
}

export function conferenceUrl(event: GoogleEvent): string | null {
	if (event.hangoutLink) return event.hangoutLink;

	const entry = event.conferenceData?.entryPoints?.find(
		(point) => point.entryPointType === "video" && point.uri,
	);

	return entry?.uri ?? null;
}

export function eventTime(
	time: GoogleEventTime | undefined,
): { at: Date; isAllDay: boolean } | null {
	if (time?.dateTime) {
		const at = new Date(time.dateTime);
		return Number.isNaN(at.getTime()) ? null : { at, isAllDay: false };
	}

	if (time?.date) {
		const at = new Date(`${time.date}T00:00:00Z`);
		return Number.isNaN(at.getTime()) ? null : { at, isAllDay: true };
	}

	return null;
}
