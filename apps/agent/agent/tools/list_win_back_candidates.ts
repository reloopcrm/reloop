import { db } from "@crm/db";
import { listReactivationCandidates, REACTIVATION } from "@crm/db/reactivation";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { tenantTool } from "../lib/tenant";

const tool = defineTool({
	description:
		"List contacts worth getting back in touch with: people who emailed this workspace and have gone quiet, ranked by the workspace's own win-back rules (points the rep configured for replies owed, emails exchanged, meetings, deals, company and title keywords). Every row carries the facts and the point breakdown, nothing is guessed. Use it for questions like who should I follow up with, which old customers went quiet, or who is waiting on a reply. Free.",
	inputSchema: z.object({
		quietForDays: z
			.number()
			.int()
			.min(REACTIVATION.quietForDays.min)
			.max(REACTIVATION.quietForDays.max)
			.default(REACTIVATION.quietForDays.default)
			.describe(
				"Only people whose last email is at least this many days old. 0 means any time.",
			),
		ownerId: z
			.string()
			.optional()
			.describe("Limit to contacts owned by this CRM user."),
		limit: z
			.number()
			.int()
			.min(REACTIVATION.limit.min)
			.max(REACTIVATION.limit.max)
			.default(REACTIVATION.limit.default),
	}),
	async execute(input) {
		const rules = await readWinBackRules(db);
		const report = await listReactivationCandidates(db, {
			quietForDays: input.quietForDays,
			limit: input.limit,
			ownerId: input.ownerId ?? null,
			rules,
		});

		return {
			quietForDays: report.quietForDays,
			generatedAt: report.generatedAt.toISOString(),
			candidates: report.candidates.map((candidate) => ({
				contactId: candidate.contact.id,
				name: [candidate.contact.firstName, candidate.contact.lastName]
					.filter(Boolean)
					.join(" "),
				email: candidate.contact.email,
				title: candidate.contact.title,
				company: candidate.contact.company,
				owner: candidate.contact.owner,
				lastContactAt: candidate.lastContactAt.toISOString(),
				quietDays: candidate.quietDays,
				waitingOnUs: candidate.waitingOnUs,
				messagesFromUs: candidate.messagesFromUs,
				messagesFromThem: candidate.messagesFromThem,
				threads: candidate.threads,
				meetings: candidate.meetings,
				openDeals: candidate.openDeals,
				wonDeals: candidate.wonDeals,
				lastSubject: candidate.lastSubject,
				memory: candidate.memory,
				repVerdict: candidate.feedback,
				points: candidate.points,
				pointLines: candidate.pointLines,
				reasons: candidate.reasons,
			})),
		};
	},
	toModelOutput(output) {
		return { type: "json", value: output };
	},
});

export default tenantTool(tool);
