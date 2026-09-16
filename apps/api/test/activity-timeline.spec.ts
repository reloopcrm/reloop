import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db, EmailDirection } from "@crm/db";
import { timelineOutput } from "../src/activities/activities.contracts";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";

const suffix = process.env.TEST_RUN_ID ?? "activity-timeline-spec";
const domain = `timeline-${suffix}.test`;
const userId = `user-${suffix}`;
const rootId = `<root-${suffix}@${domain}>`;
const buyer = `buyer@${domain}`;

const service = new ActivitiesService(db, new ActivityStampService(db));

let companyId: string;

async function clean() {
	await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `rep@${domain}` },
	});
	const company = await db.company.create({
		data: { name: "Timeline Co", domain },
		select: { id: true },
	});
	companyId = company.id;

	const older = new Date(Date.UTC(2026, 4, 1, 9));
	const newer = new Date(Date.UTC(2026, 4, 2, 9));
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: rootId,
			subject: "Pricing",
			companyId,
			firstMessageAt: older,
			lastMessageAt: newer,
			messageCount: 2,
			messages: {
				create: [
					{
						rfcMessageId: `<out-${suffix}@${domain}>`,
						direction: EmailDirection.OUTBOUND,
						fromEmail: `rep@${domain}`,
						fromName: "Test Rep",
						recipients: [],
						sentAt: older,
					},
					{
						rfcMessageId: `<in-${suffix}@${domain}>`,
						direction: EmailDirection.INBOUND,
						imapAccountId: `imap-${suffix}`,
						fromEmail: buyer,
						fromName: "A Buyer",
						recipients: [],
						sentAt: newer,
					},
				],
			},
		},
		select: { id: true },
	});
	await db.activity.create({
		data: {
			type: ActivityType.EMAIL,
			subject: "Pricing",
			occurredAt: newer,
			companyId,
			createdById: userId,
			emailThreadId: thread.id,
		},
	});
});

afterAll(clean);

describe("timeline email threads", () => {
	it("carries the newest message's sender and direction", async () => {
		const result = await service.timeline({
			companyId,
			filter: "all",
			limit: 30,
		});
		expect(() => timelineOutput.parse(result)).not.toThrow();
		expect(result.entries[0]?.emailThread).toEqual({
			id: expect.any(String),
			messageCount: 2,
			lastMessageAt: new Date(Date.UTC(2026, 4, 2, 9)).toISOString(),
			lastMessage: {
				direction: EmailDirection.INBOUND,
				fromName: "A Buyer",
				fromEmail: buyer,
				source: "IMAP",
			},
		});
	});
});
