import { ActivityType, type Db, type Prisma } from "@crm/db";
import { activityMeta } from "@crm/validation/activity-meta";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { blankToNull } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import type {
	ActivityCreateInput,
	ActivityEntry,
	ActivityUpdateInput,
	MyTasksInput,
	TimelineCounts,
	TimelineFilter,
	TimelineInput,
	TimelineResult,
} from "./activities.contracts";
import { overdueBefore } from "./due-date";
import { isEditable } from "./editable";

const AUTHOR_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const ENTRY_SELECT = {
	id: true,
	type: true,
	subject: true,
	body: true,
	occurredAt: true,
	dueAt: true,
	completedAt: true,
	meta: true,
	createdAt: true,
	createdBy: { select: AUTHOR_SELECT },
	company: { select: { id: true, name: true } },
	contact: { select: { id: true, firstName: true, lastName: true } },
	deal: { select: { id: true, name: true } },

	emailThread: {
		select: {
			id: true,
			messageCount: true,
			lastMessageAt: true,
			messages: {
				orderBy: { sentAt: "desc" },
				take: 1,
				select: {
					direction: true,
					fromName: true,
					fromEmail: true,
					gmailMessageId: true,
					outlookMessageId: true,
					imapAccountId: true,
				},
			},
		},
	},
	calendarEvent: {
		select: {
			id: true,
			startsAt: true,
			endsAt: true,
			isAllDay: true,
			location: true,
			conferenceUrl: true,
			_count: { select: { attendees: true } },
		},
	},
} as const;

const NOTE_TYPES = [
	ActivityType.NOTE,
	ActivityType.CALL,
	ActivityType.EMAIL,
	ActivityType.MEETING,
];

const HISTORY_ORDER = [
	{ occurredAt: { sort: "desc", nulls: "last" } },
	{ id: "desc" },
] satisfies Prisma.ActivityOrderByWithRelationInput[];

const UPCOMING_ORDER = [
	{ dueAt: { sort: "asc", nulls: "last" } },
	{ createdAt: "desc" },
	{ id: "desc" },
] satisfies Prisma.ActivityOrderByWithRelationInput[];

@Injectable()
export class ActivitiesService {
	private readonly logger = new Logger(ActivitiesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
	) {}

	async timeline(
		input: TimelineInput,
		actingUserId: string,
	): Promise<TimelineResult> {
		const where = this.anchor(input);
		Object.assign(where, filterClause(input.filter));

		const rows = await this.db.activity.findMany({
			where,
			take: input.limit + 1,
			cursor: input.cursor ? { id: input.cursor } : undefined,
			skip: input.cursor ? 1 : undefined,
			orderBy: input.filter === "upcoming" ? UPCOMING_ORDER : HISTORY_ORDER,
			select: ENTRY_SELECT,
		});

		const hasMore = rows.length > input.limit;
		const entries = hasMore ? rows.slice(0, input.limit) : rows;

		return {
			entries: entries.map((entry) => serializeEntry(entry, actingUserId)),
			nextCursor: hasMore ? (entries[entries.length - 1]?.id ?? null) : null,
		};
	}

	async timelineCounts(
		input: Pick<TimelineInput, "companyId" | "contactId" | "dealId">,
	): Promise<TimelineCounts> {
		const anchor = this.anchor(input);

		const [all, notes, upcoming, done, email, meetings] = await Promise.all([
			this.db.activity.count({ where: anchor }),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("notes") },
			}),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("upcoming") },
			}),
			this.db.activity.count({ where: { ...anchor, ...filterClause("done") } }),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("email") },
			}),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("meetings") },
			}),
		]);

		return { all, notes, upcoming, done, email, meetings };
	}

	async create(
		input: ActivityCreateInput,
		actingUserId: string,
	): Promise<ActivityEntry> {
		const companyId = await this.resolveCompanyId(input);

		const isTask = input.type === ActivityType.TASK;

		const activity = await this.db.activity.create({
			data: {
				type: input.type,
				subject: blankToNull(input.subject ?? ""),
				body: blankToNull(input.body ?? ""),
				occurredAt: parseDate(input.occurredAt) ?? new Date(),
				dueAt: isTask ? parseDate(input.dueAt) : null,
				companyId,
				contactId: input.contactId ?? null,
				dealId: input.dealId ?? null,
				createdById: actingUserId,
			},
			select: ENTRY_SELECT,
		});

		await this.stamp.touch(
			{ companyId, contactId: input.contactId, dealId: input.dealId },
			activity.createdAt,
		);

		this.logger.log({
			message: "Activity logged",
			activityId: activity.id,
			type: activity.type,
		});

		return serializeEntry(activity, actingUserId);
	}

	async complete(
		id: string,
		completed: boolean,
		actingUserId: string,
	): Promise<ActivityEntry> {
		const activity = await this.db.activity.findUnique({
			where: { id },
			select: { type: true },
		});

		if (!activity) {
			throw new NotFoundException(`No activity with id ${id}.`);
		}

		if (activity.type !== ActivityType.TASK) {
			throw new BadRequestException("Only tasks can be completed.");
		}

		const updated = await this.db.activity.update({
			where: { id },
			data: { completedAt: completed ? new Date() : null },
			select: ENTRY_SELECT,
		});

		return serializeEntry(updated, actingUserId);
	}

	async update(
		input: ActivityUpdateInput,
		actingUserId: string,
	): Promise<ActivityEntry> {
		const activity = await this.editable(input.id, actingUserId);
		const isTask = activity.type === ActivityType.TASK;

		if (!isTask && input.dueAt !== undefined) {
			throw new BadRequestException("Only tasks have a due date.");
		}

		const subject =
			input.subject === undefined ? undefined : blankToNull(input.subject);
		const body = input.body === undefined ? undefined : blankToNull(input.body);
		const nextSubject = subject === undefined ? activity.subject : subject;
		const nextBody = body === undefined ? activity.body : body;

		if (nextSubject === null && (isTask || nextBody === null)) {
			throw new BadRequestException("A note or a task cannot be empty.");
		}

		const updated = await this.db.activity.update({
			where: { id: input.id },
			data: {
				subject,
				body,
				dueAt:
					isTask && input.dueAt !== undefined
						? parseDate(input.dueAt)
						: undefined,
			},
			select: ENTRY_SELECT,
		});

		return serializeEntry(updated, actingUserId);
	}

	async remove(id: string, actingUserId: string): Promise<{ id: string }> {
		await this.editable(id, actingUserId);

		const deleted = await this.db.activity.delete({
			where: { id },
			select: { companyId: true, contactId: true, dealId: true },
		});

		await this.stamp.recomputeAfterDelete(
			{
				companyIds: deleted.companyId ? [deleted.companyId] : [],
				contactIds: deleted.contactId ? [deleted.contactId] : [],
				dealIds: deleted.dealId ? [deleted.dealId] : [],
			},
			deleted,
		);

		this.logger.log({ message: "Activity deleted", activityId: id });

		return { id };
	}

	async myTasks(
		input: MyTasksInput,
		actingUserId: string,
	): Promise<ActivityEntry[]> {
		const boundary = overdueBefore(new Date());
		const where: Prisma.ActivityWhereInput = {
			type: ActivityType.TASK,
			completedAt: null,
			createdById: actingUserId,
		};

		if (input.window === "overdue") where.dueAt = { lt: boundary };
		if (input.window === "upcoming") where.dueAt = { gte: boundary };

		const tasks = await this.db.activity.findMany({
			where,
			take: input.limit,
			orderBy: [
				{ dueAt: { sort: "asc", nulls: "last" } },
				{ createdAt: "desc" },
			],
			select: ENTRY_SELECT,
		});

		return tasks.map((task) => serializeEntry(task, actingUserId));
	}

	private async editable(id: string, actingUserId: string) {
		const activity = await this.db.activity.findUnique({
			where: { id },
			select: {
				type: true,
				subject: true,
				body: true,
				meta: true,
				emailThreadId: true,
				calendarEventId: true,
				createdById: true,
			},
		});

		if (!activity) {
			throw new NotFoundException(`No activity with id ${id}.`);
		}

		if (!isEditable(activity, actingUserId)) {
			throw new ForbiddenException(
				"Only your own notes and tasks can be changed.",
			);
		}

		return activity;
	}

	private anchor(
		input: Pick<TimelineInput, "companyId" | "contactId" | "dealId">,
	): Prisma.ActivityWhereInput {
		if (input.dealId) return { dealId: input.dealId };
		if (input.contactId) return { contactId: input.contactId };
		if (input.companyId) return { companyId: input.companyId };
		throw new BadRequestException(
			"A timeline needs a company, a contact or a deal.",
		);
	}

	private async resolveCompanyId(
		input: ActivityCreateInput,
	): Promise<string | null> {
		if (input.companyId) return input.companyId;

		if (input.dealId) {
			const deal = await this.db.deal.findUnique({
				where: { id: input.dealId },
				select: { companyId: true },
			});
			if (!deal) {
				throw new NotFoundException(`No deal with id ${input.dealId}.`);
			}
			return deal.companyId;
		}

		if (input.contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: input.contactId },
				select: { companyId: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${input.contactId}.`);
			}
			return contact.companyId;
		}

		return null;
	}
}

function filterClause(filter: TimelineFilter): Prisma.ActivityWhereInput {
	switch (filter) {
		case "notes":
			return { type: { in: NOTE_TYPES } };
		case "upcoming":
			return { type: ActivityType.TASK, completedAt: null };
		case "done":
			return { type: ActivityType.TASK, completedAt: { not: null } };
		case "history":
			return { NOT: { type: ActivityType.TASK, completedAt: null } };
		case "email":
			return { type: ActivityType.EMAIL };
		case "meetings":
			return { type: ActivityType.MEETING };
		case "all":
			return {};
	}
}

type Entry = Prisma.ActivityGetPayload<{ select: typeof ENTRY_SELECT }>;

type ThreadMessage = NonNullable<Entry["emailThread"]>["messages"][number];

function mailSource(message: ThreadMessage) {
	if (message.gmailMessageId) return "GMAIL" as const;
	if (message.outlookMessageId) return "OUTLOOK" as const;
	if (message.imapAccountId) return "IMAP" as const;
	return null;
}

function lastMessage(message: ThreadMessage | undefined) {
	if (!message) return null;
	return {
		direction: message.direction,
		fromName: message.fromName,
		fromEmail: message.fromEmail,
		source: mailSource(message),
	};
}

function serializeEntry(entry: Entry, actingUserId: string) {
	return {
		...entry,
		occurredAt: entry.occurredAt?.toISOString() ?? null,
		dueAt: entry.dueAt?.toISOString() ?? null,
		completedAt: entry.completedAt?.toISOString() ?? null,
		createdAt: entry.createdAt.toISOString(),
		meta: activityMeta.parse(entry.meta),

		emailThread: entry.emailThread
			? {
					id: entry.emailThread.id,
					messageCount: entry.emailThread.messageCount,
					lastMessageAt: entry.emailThread.lastMessageAt.toISOString(),
					lastMessage: lastMessage(entry.emailThread.messages[0]),
				}
			: null,

		calendarEvent: entry.calendarEvent
			? {
					id: entry.calendarEvent.id,
					startsAt: entry.calendarEvent.startsAt.toISOString(),
					endsAt: entry.calendarEvent.endsAt.toISOString(),
					isAllDay: entry.calendarEvent.isAllDay,
					location: entry.calendarEvent.location,
					conferenceUrl: entry.calendarEvent.conferenceUrl,
					attendeeCount: entry.calendarEvent._count.attendees,
				}
			: null,

		editable: isEditable(
			{
				type: entry.type,
				meta: entry.meta,
				emailThreadId: entry.emailThread?.id ?? null,
				calendarEventId: entry.calendarEvent?.id ?? null,
				createdById: entry.createdBy.id,
			},
			actingUserId,
		),
	};
}

function parseDate(value: string | null | undefined): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`"${value}" is not a date.`);
	}
	return date;
}
