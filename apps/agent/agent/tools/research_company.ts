import { ActivityType, db } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { liveCompany, NOT_LIVE, researchAuthor } from "../lib/crm";
import { refund, spend } from "../lib/focus";
import { RESEARCH } from "../lib/research-config";
import { assertResearchPurpose } from "../lib/session-purpose";
import { tenantTool } from "../lib/tenant";
import { askPage, fetchPage } from "../lib/website-brand";

const RESEARCH_INSTRUCTIONS = [
	"You read a company's marketing site and answer as a salesperson preparing for a first call.",
	"Be specific and factual. Leave a field empty rather than guessing.",
	"positioning is one paragraph: what they sell and who to.",
	"pricingModel is how they charge — per seat, usage, flat, enterprise-only.",
	"targetCustomer is the customer they describe themselves as serving.",
	"notableCustomers are named customers or logos on the site.",
	"recentNews are recent announcements, funding, or launches.",
];

const briefText = z.string().trim().min(1).nullable().catch(null);

const briefList = z
	.array(z.string().nullable().catch(null))
	.transform((items) => items.filter((item) => item !== null))
	.catch([]);

const researchBrief = z.object({
	positioning: briefText,
	pricingModel: briefText,
	targetCustomer: briefText,
	notableCustomers: briefList,
	recentNews: briefList,
});

type ResearchBrief = z.infer<typeof researchBrief>;

const BRIEF_SOURCE = "website";

const tool = defineTool({
	description:
		"Read a company's own website and write a research brief to its timeline: positioning, pricing, who they sell to, notable customers, recent news. One brief per company: a new read replaces the old one.",
	inputSchema: z.object({
		companyId: z.string(),
	}),
	async execute({ companyId }, ctx) {
		assertResearchPurpose(ctx);

		const company = await liveCompany(companyId, {
			id: true,
			name: true,
			domain: true,
			website: true,
			ownerId: true,
		});

		if (!company) return { written: false as const, reason: NOT_LIVE.company };

		const domain = company.domain ?? hostOf(company.website);

		if (!domain) {
			return {
				written: false as const,
				reason: "This company has no website.",
			};
		}

		const author = await researchAuthor(company.ownerId);

		if (!author)
			return { written: false as const, reason: "No user to attribute to." };

		const cost = RESEARCH.cost.siteBrief;
		const charge = spend(cost);
		if (!charge.ok) return { written: false as const, reason: charge.reason };

		const page = await fetchPage(domain);

		if (!page) {
			refund(cost);
			return {
				written: false as const,
				reason: `The website ${domain} did not answer with a page to read. Nothing was charged.`,
			};
		}

		const answer = await askPage(page, researchBrief, RESEARCH_INSTRUCTIONS);

		if (!answer.ok) {
			refund(cost);
			return answer.retryable
				? {
						written: false as const,
						retryable: true as const,
						reason: `The site was read, but ${answer.reason}. Nothing was charged. Retrying later can help.`,
					}
				: {
						written: false as const,
						retryable: false as const,
						reason: `The site was read, but ${answer.reason}. Retrying will not help.`,
					};
		}

		const body = formatBrief(answer.data);

		if (body === "") {
			return {
				written: false as const,
				reason: "The site says nothing worth writing down.",
			};
		}

		const saved = await saveBrief({
			companyId: company.id,
			subject: `Research brief: ${company.name}`,
			body,
			url: page.url.toString(),
			author,
		});

		if (!saved) return { written: false as const, reason: NOT_LIVE.company };

		if (!saved.changed) {
			return {
				written: false as const,
				activityId: saved.id,
				reason:
					"The brief on the timeline already says exactly this. Nothing changed.",
			};
		}

		return {
			written: true as const,
			activityId: saved.id,
			replaced: saved.replaced,
		};
	},
});

async function saveBrief(input: {
	companyId: string;
	subject: string;
	body: string;
	url: string;
	author: string;
}): Promise<{ id: string; changed: boolean; replaced: boolean } | null> {
	return db.$transaction(async (tx) => {
		await lockIdempotencyKey(
			tx,
			`research-brief:${input.companyId}:${BRIEF_SOURCE}`,
		);

		if (!(await liveCompany(input.companyId, { id: true }, tx))) return null;

		const existing = await tx.activity.findFirst({
			where: {
				companyId: input.companyId,
				type: ActivityType.ENRICHMENT,
				AND: [
					{ meta: { path: ["source"], equals: BRIEF_SOURCE } },
					{ meta: { path: ["agent"], equals: "people-research" } },
				],
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			select: { id: true, body: true },
		});

		if (existing?.body === input.body) {
			return { id: existing.id, changed: false, replaced: false };
		}

		const now = new Date();
		const data = {
			subject: input.subject,
			body: input.body,
			occurredAt: now,
			meta: { source: BRIEF_SOURCE, url: input.url, agent: "people-research" },
		};

		const row = existing
			? await tx.activity.update({
					where: { id: existing.id },
					data,
					select: { id: true },
				})
			: await tx.activity.create({
					data: {
						...data,
						type: ActivityType.ENRICHMENT,
						companyId: input.companyId,
						createdById: input.author,
					},
					select: { id: true },
				});

		await tx.company.update({
			where: { id: input.companyId },
			data: { lastActivityAt: now },
		});

		return { id: row.id, changed: true, replaced: existing !== null };
	});
}

export default tenantTool(tool);

function hostOf(website: string | null): string | null {
	if (!website) return null;

	try {
		return new URL(
			/^https?:\/\//i.test(website) ? website : `https://${website}`,
		).hostname;
	} catch {
		return null;
	}
}

function formatBrief(brief: ResearchBrief): string {
	const lines: string[] = [];

	if (brief.positioning) lines.push(brief.positioning);
	if (brief.pricingModel) lines.push(`Pricing: ${brief.pricingModel}`);
	if (brief.targetCustomer) lines.push(`Sells to: ${brief.targetCustomer}`);

	if (brief.notableCustomers.length > 0) {
		lines.push(`Customers: ${brief.notableCustomers.join(", ")}`);
	}

	if (brief.recentNews.length > 0) {
		lines.push(
			`Recently:\n${brief.recentNews.map((item) => `• ${item}`).join("\n")}`,
		);
	}

	return lines.join("\n\n");
}
