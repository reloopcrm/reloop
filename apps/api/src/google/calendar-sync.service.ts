import {
	ActivityType,
	type Db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
	type Prisma,
	RecordSource,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import {
	MailboxMatchService,
	type MatchContext,
} from "../mailbox/mailbox-match.service";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { isMachineAddress, type Participant } from "../mailbox/participants";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	CalendarClient,
	conferenceUrl,
	eventTime,
	type GoogleEvent,
} from "./calendar.client";
import { CALENDAR } from "./calendar.config";
import { heldByUser, releaseEvents } from "./calendar-holders";
import {
	type CalendarPageCursor,
	readCalendarPage,
	serialiseCalendarPage,
} from "./calendar-page-cursor";
import { MeetingPrepService } from "./meeting-prep.service";

type CalendarPass = {
	syncToken: string | null;
	pageToken: string | undefined;
	timeMin: string;
	timeMax: string;
};

export type SyncOutcome = {
	source: "calendar";
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
	eventsWritten?: number;
	eventsRemoved?: number;
	reason?: string;
};

@Injectable()
export class CalendarSyncService {
	private readonly logger = new Logger(CalendarSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly calendar: CalendarClient,
		private readonly tokens: MailboxTokenService,
		private readonly match: MailboxMatchService,
		private readonly state: SyncStateService,
		private readonly stamp: ActivityStampService,
		private readonly prep: MeetingPrepService,
	) {}

	async sync(row: MailboxSync): Promise<SyncOutcome> {
		const token = await this.tokens.accessTokenFor(row.userId, "calendar");

		if (token.outcome === "not-connected") {
			return {
				source: "calendar",
				userId: row.userId,
				status: "skipped",
				reason: token.reason,
			};
		}

		if (token.outcome === "needs-reconnect") {
			await this.state.markNeedsReconnect(row.id, token.reason);
			return {
				source: "calendar",
				userId: row.userId,
				status: "reconnect",
				reason: token.reason,
			};
		}

		await this.state.markRunning(row.id);

		const [internal, suppressedDomains, suppressedEmails] = await Promise.all([
			this.match.internalIdentity(),
			this.match.suppressedDomains(),
			this.match.suppressedEmails(),
		]);

		const context = {
			ourAddresses: internal.addresses,
			ourDomains: internal.domains,
			suppressedDomains,
			suppressedEmails,
		};

		let pass = this.startPass(row, Date.now());
		let written = 0;
		let removed = 0;

		for (let page = 0; page < CALENDAR.sync.maxPagesPerTick; page += 1) {
			const result = await this.calendar.listEvents(token.accessToken, {
				syncToken: pass.syncToken ?? undefined,
				pageToken: pass.pageToken,
				timeMin: pass.timeMin,
				timeMax: pass.timeMax,
			});

			if (result.outcome === "cursor-invalid") {
				await this.state.saveBackfill(row.id, null);
				await this.state.clearCursor(row.id, result.reason);
				return {
					source: "calendar",
					userId: row.userId,
					status: "synced",
					eventsWritten: written,
					eventsRemoved: removed,
					reason: "Cursor reset; the next tick re-runs the window.",
				};
			}

			if (result.outcome === "unauthorized") {
				await this.state.markNeedsReconnect(row.id, result.reason);
				return {
					source: "calendar",
					userId: row.userId,
					status: "reconnect",
					reason: result.reason,
				};
			}

			if (result.outcome === "rate-limited") {
				await this.state.markRateLimited(row.id, result.retryAfterMs);
				return {
					source: "calendar",
					userId: row.userId,
					status: "rate-limited",
					reason: result.reason,
				};
			}

			if (result.outcome === "failed" || result.outcome === "unreadable") {
				if (result.outcome === "failed" && !result.retryable) {
					await this.state.saveBackfill(
						row.id,
						serialiseCalendarPage(savedPass(pass, null, pass.syncToken)),
					);
				}
				await this.state.markFailed(row.id, result.reason);
				return {
					source: "calendar",
					userId: row.userId,
					status: "failed",
					reason: result.reason,
				};
			}

			for (const event of result.data.items ?? []) {
				const applied = await this.apply(event, row, context);
				if (applied === "written") written += 1;
				if (applied === "removed") removed += 1;
			}

			const nextPageToken = result.data.nextPageToken;

			if (!nextPageToken) {
				const next = result.data.nextSyncToken ?? pass.syncToken;
				const renew = next !== null && windowEnding(pass, Date.now());
				const cursor = renew ? null : next;
				await this.state.settle(row.id, {
					cursor,
					backfill: renew
						? null
						: serialiseCalendarPage(savedPass(pass, null, cursor)),
					status: GoogleSyncStatus.RUNNING,
				});

				if (renew) {
					this.logger.log({
						message: "Calendar sync window ends. The next tick reads a new one",
						syncId: row.id,
						timeMax: pass.timeMax,
					});
				}

				this.logger.log({
					message: "Calendar sync complete",
					userId: row.userId,
					eventsWritten: written,
					eventsRemoved: removed,
				});

				return {
					source: "calendar",
					userId: row.userId,
					status: "synced",
					eventsWritten: written,
					eventsRemoved: removed,
				};
			}

			pass = { ...pass, pageToken: nextPageToken };
			await this.state.saveBackfill(
				row.id,
				serialiseCalendarPage(savedPass(pass, nextPageToken, pass.syncToken)),
			);
		}

		await this.state.settle(row.id, {
			status: GoogleSyncStatus.IDLE,
		});

		return {
			source: "calendar",
			userId: row.userId,
			status: "synced",
			eventsWritten: written,
			eventsRemoved: removed,
			reason: "Page budget reached; continuing next tick.",
		};
	}

	private startPass(row: MailboxSync, now: number): CalendarPass {
		const syncToken = row.cursor ?? null;
		const saved = readCalendarPage(row.backfill);

		if (saved.outcome === "unreadable") {
			this.logger.warn({
				message: "Calendar page cursor unreadable. Starting the pass again",
				syncId: row.id,
				reason: saved.reason,
			});
		}

		const resumes =
			saved.outcome === "ok" &&
			saved.cursor.syncToken === syncToken &&
			(saved.cursor.pageToken !== null || syncToken !== null);
		if (resumes) {
			const { pageToken, timeMin, timeMax } = saved.cursor;
			return { syncToken, pageToken: pageToken ?? undefined, timeMin, timeMax };
		}

		if (syncToken) {
			const unknown = new Date(now).toISOString();
			return {
				syncToken,
				pageToken: undefined,
				timeMin: unknown,
				timeMax: unknown,
			};
		}

		return {
			syncToken,
			pageToken: undefined,
			timeMin: new Date(now).toISOString(),
			timeMax: new Date(now + CALENDAR.sync.horizonMs).toISOString(),
		};
	}

	private async remove(
		event: GoogleEvent,
		userId: string,
	): Promise<"removed" | "ignored"> {
		const held = await this.heldBy(event, userId);
		if (held.length === 0) return "ignored";

		await this.db.$transaction((tx) => releaseEvents(tx, userId, held));

		return "removed";
	}

	private async heldBy(event: GoogleEvent, userId: string): Promise<string[]> {
		const iCalUid = event.iCalUID;
		const mine = heldByUser(userId);

		if (event.id) {
			const rows = await this.db.calendarEvent.findMany({
				where: {
					AND: [
						mine,
						{ iCalUid },
						{
							OR: [
								{ googleEventId: event.id },
								{ holders: { some: { userId, googleEventId: event.id } } },
							],
						},
					],
				},
				select: { id: true, iCalUid: true },
			});
			const uids = new Set(rows.map((found) => found.iCalUid));

			if (uids.size > 1) {
				this.logger.warn({
					message: "Cancelled calendar entry matches several events. Kept",
					googleEventId: event.id,
					matches: rows.length,
				});
				return [];
			}

			if (rows.length > 0) return rows.map((found) => found.id);
		}

		if (!iCalUid) return [];

		if (!event.recurringEventId && !event.originalStartTime) {
			return this.idsOf({
				AND: [mine, { iCalUid, recurringEventId: null }],
			});
		}

		const originalStart =
			eventTime(event.originalStartTime) ?? eventTime(event.start);
		if (!originalStart) return [];

		return this.idsOf({
			AND: [mine, { iCalUid, originalStartTime: originalStart.at }],
		});
	}

	private async idsOf(
		where: Prisma.CalendarEventWhereInput,
	): Promise<string[]> {
		const rows = await this.db.calendarEvent.findMany({
			where,
			select: { id: true },
		});
		return rows.map((found) => found.id);
	}

	private async existing(
		event: GoogleEvent,
		iCalUid: string,
	): Promise<{ id: string; googleEventId: string | null } | null> {
		const select = { id: true, googleEventId: true } as const;

		if (event.id) {
			const byId = await this.db.calendarEvent.findFirst({
				where: { googleEventId: event.id, iCalUid },
				orderBy: { createdAt: "asc" },
				select,
			});
			if (byId) return byId;
		}

		if (event.recurringEventId) return null;

		return this.db.calendarEvent.findFirst({
			where: { iCalUid, recurringEventId: null },
			orderBy: { createdAt: "asc" },
			select,
		});
	}

	private async apply(
		event: GoogleEvent,
		row: MailboxSync,
		context: MatchContext,
	): Promise<"written" | "removed" | "ignored"> {
		if (event.status === "cancelled") return this.remove(event, row.userId);

		const iCalUid = event.iCalUID;
		if (!iCalUid) return "ignored";

		const start = eventTime(event.start);
		const end = eventTime(event.end);
		const originalStart = eventTime(event.originalStartTime) ?? start;

		if (!start || !end || !originalStart) return "ignored";

		const participants = this.participantsOf(event);

		const declinedByUs = event.attendees?.some(
			(attendee) => attendee.self && attendee.responseStatus === "declined",
		);

		const match = await this.match.resolve(
			{
				participants,
				allowCreate: row.autoCreate && !declinedByUs,
				source: RecordSource.CALENDAR,
				ownerId: row.userId,
			},
			context,
		);

		if (!match.companyId && !match.contactId) {
			return "ignored";
		}

		const organizer = event.organizer?.email?.toLowerCase() ?? null;

		const fields = {
			title: event.summary ?? null,
			description: event.description ?? null,
			location: event.location ?? null,
			conferenceUrl: conferenceUrl(event),
			startsAt: start.at,
			endsAt: end.at,
			isAllDay: start.isAllDay,
			status: event.status ?? "confirmed",
			organizerEmail: organizer,
			companyId: match.companyId,
			contactId: match.contactId,
		};

		const found = await this.existing(event, iCalUid);

		const record = found
			? await this.db.calendarEvent.update({
					where: { id: found.id },
					data: {
						...fields,
						googleEventId: found.googleEventId ?? event.id ?? null,
					},
					select: { id: true },
				})
			: await this.db.calendarEvent.upsert({
					where: {
						iCalUid_originalStartTime: {
							iCalUid,
							originalStartTime: originalStart.at,
						},
					},
					create: {
						...fields,
						iCalUid,
						originalStartTime: originalStart.at,
						recurringEventId: event.recurringEventId ?? null,
						syncedByUserId: row.userId,
						googleEventId: event.id ?? null,
					},
					update: fields,
					select: { id: true },
				});

		await this.db.calendarEventSync.upsert({
			where: { eventId_userId: { eventId: record.id, userId: row.userId } },
			create: {
				eventId: record.id,
				userId: row.userId,
				googleEventId: event.id ?? null,
			},
			update: { googleEventId: event.id ?? undefined },
		});
		await this.syncAttendees(record.id, event);
		await this.prep.forEvent(record.id);
		await this.project(record.id, row.userId, {
			title: event.summary ?? null,
			startsAt: start.at,
			companyId: match.companyId,
			contactId: match.contactId,
		});

		return "written";
	}

	private async syncAttendees(
		eventId: string,
		event: GoogleEvent,
	): Promise<void> {
		const attendees = (event.attendees ?? []).filter(
			(attendee) =>
				attendee.email &&
				!attendee.resource &&
				!isMachineAddress(attendee.email.toLowerCase()),
		);

		const emails = attendees.map((attendee) =>
			(attendee.email as string).toLowerCase(),
		);

		if (!event.attendeesOmitted) {
			await this.db.calendarAttendee.deleteMany({
				where: { eventId, email: { notIn: emails } },
			});
		}

		if (attendees.length === 0) return;

		const contacts = await this.db.contact.findMany({
			where: { email: { in: emails } },
			select: { id: true, email: true },
		});

		const contactByEmail = new Map(
			contacts.map((contact) => [contact.email as string, contact.id]),
		);

		for (const attendee of attendees) {
			const email = (attendee.email as string).toLowerCase();

			await this.db.calendarAttendee.upsert({
				where: { eventId_email: { eventId, email } },
				create: {
					eventId,
					email,
					name: attendee.displayName ?? null,
					responseStatus: attendee.responseStatus ?? null,
					isOrganizer: attendee.organizer ?? false,
					isSelf: attendee.self ?? false,
					contactId: contactByEmail.get(email) ?? null,
				},
				update: {
					name: attendee.displayName ?? null,
					responseStatus: attendee.responseStatus ?? null,
					isOrganizer: attendee.organizer ?? false,
					isSelf: attendee.self ? true : undefined,
					contactId: contactByEmail.get(email) ?? null,
				},
			});
		}
	}

	private async project(
		calendarEventId: string,
		userId: string,
		summary: {
			title: string | null;
			startsAt: Date;
			companyId: string | null;
			contactId: string | null;
		},
	): Promise<void> {
		const activity = await this.db.activity.upsert({
			where: { calendarEventId },
			create: {
				type: ActivityType.MEETING,
				subject: summary.title,
				body: null,
				occurredAt: summary.startsAt,
				companyId: summary.companyId,
				contactId: summary.contactId,
				createdById: userId,
				calendarEventId,
				meta: { synced: true, source: "calendar" },
			},
			update: {
				subject: summary.title,
				body: null,
				occurredAt: summary.startsAt,
				companyId: summary.companyId,
				contactId: summary.contactId,
			},
			select: { createdAt: true },
		});

		await this.stamp.touch(
			{ companyId: summary.companyId, contactId: summary.contactId },
			activity.createdAt,
		);
	}

	private participantsOf(event: GoogleEvent): Participant[] {
		const people: Participant[] = [];

		for (const attendee of event.attendees ?? []) {
			if (!attendee.email || attendee.resource) continue;
			people.push({
				email: attendee.email.toLowerCase(),
				name: attendee.displayName ?? null,
			});
		}

		if (event.organizer?.email) {
			people.push({
				email: event.organizer.email.toLowerCase(),
				name: event.organizer.displayName ?? null,
			});
		}

		return people;
	}
}

function windowEnding(pass: CalendarPass, now: number): boolean {
	return now >= Date.parse(pass.timeMax) - CALENDAR.sync.windowReserveMs;
}

function savedPass(
	pass: CalendarPass,
	pageToken: string | null,
	syncToken: string | null,
): CalendarPageCursor {
	return {
		v: 1,
		pageToken,
		syncToken,
		timeMin: pass.timeMin,
		timeMax: pass.timeMax,
	};
}
