import { ActivityType, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { spend } from "../lib/focus";
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

const tool = defineTool({
	description:
		"Read a company's own website and write a research brief to its timeline: positioning, pricing, who they sell to, notable customers, recent news.",
	inputSchema: z.object({
		companyId: z.string(),
	}),
	async execute({ companyId }) {
		const company = await db.company.findUnique({
			where: { id: companyId },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				ownerId: true,
			},
		});

		if (!company)
			return { written: false as const, reason: "No such company." };

		const domain = company.domain ?? hostOf(company.website);

		if (!domain) {
			return {
				written: false as const,
				reason: "This company has no website.",
			};
		}

		const charge = spend(1);
		if (!charge.ok) return { written: false as const, reason: charge.reason };

		const page = await fetchPage(domain);

		if (!page) {
			return {
				written: false as const,
				reason: `The website ${domain} did not answer with a page to read.`,
			};
		}

		const brief = await askPage(page, researchBrief, RESEARCH_INSTRUCTIONS);

		if (!brief) {
			return {
				written: false as const,
				reason:
					"The site was read but nothing could be made of it. Retrying will not help.",
			};
		}

		const body = formatBrief(brief);

		if (body === "") {
			return {
				written: false as const,
				reason: "The site says nothing worth writing down.",
			};
		}

		const author =
			company.ownerId ??
			(await db.user.findFirst({ select: { id: true } }))?.id ??
			null;

		if (!author)
			return { written: false as const, reason: "No user to attribute to." };

		const activity = await db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: `Research brief — ${company.name}`,
				body,
				occurredAt: new Date(),
				companyId: company.id,
				createdById: author,
				meta: {
					source: "website",
					url: page.url.toString(),
					agent: "people-research",
				},
			},
			select: { id: true },
		});

		await db.company.update({
			where: { id: companyId },
			data: { lastActivityAt: new Date() },
		});

		return { written: true as const, activityId: activity.id };
	},
});

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
