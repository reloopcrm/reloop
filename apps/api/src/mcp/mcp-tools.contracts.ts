import { z } from "zod";
import {
	reactivationListInput,
	winBackBand,
} from "../reactivation/reactivation.contracts";
import { MCP } from "./mcp.config";

const recordId = z.string().trim().min(1).max(MCP.limits.id.maxChars);

export const mcpRecordKind = z.enum(MCP.record.kinds);

export const searchToolInput = z.object({
	query: z
		.string()
		.trim()
		.min(1)
		.max(MCP.limits.search.queryChars)
		.describe(
			"Words to look for in company names and domains, contact names and addresses, and deal names.",
		),
});

export const fetchToolInput = z.object({
	id: recordId.describe(
		'A record id from the search tool, for example "contact:abc123".',
	),
});

export const winBackToolInput = z.object({
	q: reactivationListInput.shape.q
		.unwrap()
		.optional()
		.describe("Filter by company or person name."),
	potential: reactivationListInput.shape.potential
		.unwrap()
		.optional()
		.describe("Keep only these potential bands: high, medium, low."),
	scope: reactivationListInput.shape.scope
		.unwrap()
		.optional()
		.describe(
			'"me" keeps the contacts the caller owns. "everyone" is the default.',
		),
	page: reactivationListInput.shape.page
		.unwrap()
		.optional()
		.describe("Page number, starting at 1."),
	pageSize: z
		.number()
		.int()
		.min(1)
		.max(MCP.limits.winBack.maxRows)
		.optional()
		.describe(`Rows per page. Default ${MCP.limits.winBack.rows}.`),
});

export const contactToolInput = z.object({
	contactId: recordId.describe(
		'The contact id, without the "contact:" prefix.',
	),
});

export const threadToolInput = z.object({
	threadId: recordId.describe("The email thread id from get_contact_mails."),
});

export type SearchToolInput = z.infer<typeof searchToolInput>;
export type FetchToolInput = z.infer<typeof fetchToolInput>;
export type WinBackToolInput = z.infer<typeof winBackToolInput>;
export type ContactToolInput = z.infer<typeof contactToolInput>;
export type ThreadToolInput = z.infer<typeof threadToolInput>;

const person = z.object({
	name: z.string().nullable(),
	email: z.string().nullable(),
});

export const searchToolOutput = z.object({
	results: z.array(
		z.object({ id: z.string(), title: z.string(), url: z.string() }),
	),
});

export const fetchToolOutput = z.object({
	id: z.string(),
	title: z.string(),
	text: z.string(),
	url: z.string(),
	metadata: z.object({
		kind: mcpRecordKind,
		detail: z.string().nullable(),
	}),
});

const winBackPerson = z.object({
	contactId: z.string(),
	name: z.string(),
	email: z.string().nullable(),
	title: z.string().nullable(),
	url: z.string(),
	potential: winBackBand,
	quietDays: z.number(),
	waitingOnUs: z.boolean(),
	lastContactAt: z.string(),
	memorySummary: z.string().nullable(),
});

export const winBackToolOutput = z.object({
	rows: z.array(
		z.object({
			name: z.string(),
			company: z
				.object({ id: z.string(), name: z.string(), url: z.string() })
				.nullable(),
			potential: winBackBand,
			quietDays: z.number(),
			waitingOnUs: z.boolean(),
			lastContactAt: z.string(),
			memorySummary: z.string().nullable(),
			people: z.array(winBackPerson),
		}),
	),
	total: z.number(),
	people: z.number(),
	bands: z.object({
		high: z.object({ companies: z.number(), people: z.number() }),
		medium: z.object({ companies: z.number(), people: z.number() }),
		low: z.object({ companies: z.number(), people: z.number() }),
	}),
	page: z.number(),
	pageSize: z.number(),
	truncated: z.boolean(),
	quietForDays: z.number(),
});

const story = z.object({
	gist: z.string(),
	together: z.string().nullable(),
	stopped: z.string().nullable(),
	stoppedQuote: z.string().nullable(),
	bringBack: z.string().nullable(),
	bringBackPoints: z.array(z.string()),
});

export const contactToolOutput = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	title: z.string().nullable(),
	url: z.string(),
	company: z
		.object({
			id: z.string(),
			name: z.string(),
			domain: z.string().nullable(),
			industry: z.string().nullable(),
			url: z.string(),
		})
		.nullable(),
	owner: person.nullable(),
	deals: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			stage: z.string(),
			role: z.string().nullable(),
			amount: z.number().nullable(),
			currency: z.string().nullable(),
			expectedCloseDate: z.string().nullable(),
			url: z.string(),
		}),
	),
	brief: z.string().nullable(),
	winBack: z
		.object({
			potential: winBackBand.nullable(),
			quietDays: z.number(),
			waitingOnUs: z.boolean(),
			firstContactAt: z.string(),
			lastContactAt: z.string(),
			brief: z.string().nullable(),
			story: story.nullable(),
			facts: z.object({
				orders: z.number(),
				maxPallets: z.number().nullable(),
				products: z.array(z.string()),
				unit: z.string(),
			}),
		})
		.nullable(),
});

export const contactMailsToolOutput = z.object({
	contactId: z.string(),
	mailCount: z.number(),
	mails: z.array(
		z.object({
			id: z.string(),
			threadId: z.string(),
			subject: z.string().nullable(),
			direction: z.enum(["INBOUND", "OUTBOUND"]),
			from: person,
			sentAt: z.string(),
			summary: z.string().nullable(),
			body: z.string().nullable(),
			marks: z.array(z.string()),
			key: z.boolean(),
			unanswered: z.boolean(),
		}),
	),
});

export const contactDraftToolOutput = z.object({
	contactId: z.string(),
	queued: z.boolean(),
	waitingUntil: z.string().nullable(),
	draft: z
		.object({
			subject: z.string(),
			body: z.string(),
			language: z.string().nullable(),
			writtenAt: z.string(),
			stale: z.boolean(),
		})
		.nullable(),
});

export const threadToolOutput = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	company: z.object({ id: z.string(), name: z.string() }).nullable(),
	contact: z.object({ id: z.string(), name: z.string() }).nullable(),
	summary: z.string().nullable(),
	outcome: z.string().nullable(),
	messageCount: z.number(),
	firstMessageAt: z.string(),
	lastMessageAt: z.string(),
	messages: z.array(
		z.object({
			id: z.string(),
			direction: z.string(),
			from: person,
			recipients: z.array(
				z.object({
					email: z.string(),
					name: z.string().nullable(),
					kind: z.string(),
				}),
			),
			sentAt: z.string(),
			summary: z.string().nullable(),
			body: z.string().nullable(),
		}),
	),
});

export type SearchToolOutput = z.infer<typeof searchToolOutput>;
export type FetchToolOutput = z.infer<typeof fetchToolOutput>;
export type WinBackToolOutput = z.infer<typeof winBackToolOutput>;
export type ContactToolOutput = z.infer<typeof contactToolOutput>;
export type ContactMailsToolOutput = z.infer<typeof contactMailsToolOutput>;
export type ContactDraftToolOutput = z.infer<typeof contactDraftToolOutput>;
export type ThreadToolOutput = z.infer<typeof threadToolOutput>;

const recordRef = z
	.string()
	.trim()
	.transform((value, ctx) => {
		const at = value.indexOf(MCP.record.separator);
		const kind = mcpRecordKind.safeParse(value.slice(0, at));
		const id = value.slice(at + MCP.record.separator.length).trim();
		if (at < 0 || !kind.success || id.length === 0) {
			ctx.addIssue({ code: "custom", message: MCP.messages.unknownRecord });
			return z.NEVER;
		}
		return { kind: kind.data, id };
	});

export type McpRecordRef = z.output<typeof recordRef>;

export function parseRecordRef(value: string): McpRecordRef | null {
	const parsed = recordRef.safeParse(value);
	return parsed.success ? parsed.data : null;
}
