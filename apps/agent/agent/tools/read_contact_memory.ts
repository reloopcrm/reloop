import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { focusOn } from "../lib/focus";
import { untrusted } from "../lib/untrusted";
import { tenantTool } from "../lib/tenant";

const tool = defineTool({
	description:
		"Read the running memory the CRM keeps about a contact: a short summary of every relevant conversation, how many deals were done, open inquiries, the largest quantity they asked about, the products involved, and the rep's own verdict on their potential. Bounded to a few hundred words, so prefer it over reading every thread. Free.",
	inputSchema: z.object({ contactId: z.string() }),
	async execute({ contactId }) {
		focusOn({ contactId });

		const [memory, feedback, insights] = await Promise.all([
			db.contactMemory.findUnique({ where: { contactId } }),
			db.potentialFeedback.findUnique({ where: { contactId } }),
			db.threadInsight.findMany({
				where: { thread: { contactId } },
				orderBy: { lastMessageAt: "desc" },
				take: 10,
				select: {
					threadId: true,
					relevant: true,
					outcome: true,
					side: true,
					quantityPallets: true,
					loads: true,
					products: true,
					unansweredByUs: true,
					summary: true,
					lastMessageAt: true,
				},
			}),
		]);

		if (!memory && insights.length === 0) {
			return {
				found: false as const,
				reason:
					"No conversation with this contact has been read yet. read_crm_history has the raw threads.",
			};
		}

		return {
			found: true as const,
			memory: memory
				? {
						summary: untrusted(memory.summary),
						didBusiness: memory.didBusiness,
						openInquiries: memory.openInquiries,
						maxPallets: memory.maxPallets,
						products: memory.products,
						lastOutcome: memory.lastOutcome,
						threadsRead: memory.coveredThreadIds.length,
						updatedAt: memory.updatedAt.toISOString(),
					}
				: null,
			repVerdict: feedback
				? { verdict: feedback.verdict, note: feedback.note }
				: null,
			conversations: insights.map((entry) => ({
				...entry,
				summary: untrusted(entry.summary),
				lastMessageAt: entry.lastMessageAt.toISOString(),
			})),
		};
	},
});

export default tenantTool(tool);
