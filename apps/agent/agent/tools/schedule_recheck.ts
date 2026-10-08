import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { isSampleRecordId } from "@crm/db/sample-data";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { RESEARCH } from "../lib/research-config";
import { assertResearchPurpose } from "../lib/session-purpose";
import { scheduleTask, taskKindEnabled } from "../lib/tasks";
import { tenantTool } from "../lib/tenant";

const KIND = "recheck";

const tool = defineTool({
	description:
		"Decide when this contact is worth looking at again, and say why. Use a short interval for people whose job change would move a live deal, a long one for quiet records, and skip it entirely for addresses nobody will ever sell to.",
	inputSchema: z.object({
		contactId: z.string(),
		days: z
			.number()
			.int()
			.min(RESEARCH.recheck.minDays)
			.max(RESEARCH.recheck.maxDays)
			.describe(
				"14 for a champion on an open deal; 90 for a named contact with no deal; 365 when two attempts have found nothing.",
			),
		reason: z
			.string()
			.min(10)
			.describe(
				"Why this interval, for this person. A rep reads it: 'a job change here would move the Acme deal', not 'scheduled recheck'.",
			),
		budget: z
			.number()
			.int()
			.min(1)
			.max(RESEARCH.budget.maxUnits)
			.default(RESEARCH.budget.defaultUnits)
			.describe("Vendor calls the next run may spend."),
	}),
	async execute({ contactId, days, reason, budget }, ctx) {
		assertResearchPurpose(ctx);

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { archivedAt: true },
		});

		if (!contact) {
			return { scheduled: false as const, reason: "No such contact." };
		}

		if (contact.archivedAt) {
			return {
				scheduled: false as const,
				reason: "This contact is archived. Nothing is rechecked on it.",
			};
		}

		if (isSampleRecordId(contactId)) {
			return {
				scheduled: false as const,
				reason: "This is sample data. Sample records are never rechecked.",
			};
		}

		if (!(await taskKindEnabled(KIND))) {
			return {
				scheduled: false as const,
				reason:
					"The recheck function is turned off in Settings. Nothing was scheduled.",
			};
		}

		const dueAt = new Date(Date.now() + days * RESEARCH.recheck.dayMs);

		const task = await scheduleTask({
			contactId,
			kind: KIND,
			reason,
			dueAt,
			budget,
			priority: PRIORITY.recheck,
		});

		if (!task) {
			return {
				scheduled: false as const,
				reason: "The recheck could not be scheduled. Nothing was written.",
			};
		}

		return { scheduled: true as const, dueAt: dueAt.toISOString(), reason };
	},
});

export default tenantTool(tool);
