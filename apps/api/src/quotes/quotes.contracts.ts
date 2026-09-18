import { DealStage } from "@crm/db";
import { z } from "zod";

export const quoteRowOutput = z.object({
	threadId: z.string(),
	subject: z.string().nullable(),
	summary: z.string(),
	lastMessageAt: z.string(),
	quantityPallets: z.number().nullable(),
	products: z.array(z.string()),
	company: z.object({ id: z.string(), name: z.string() }),
	contact: z
		.object({
			id: z.string(),
			firstName: z.string(),
			lastName: z.string().nullable(),
			email: z.string().nullable(),
			imageUrl: z.string().nullable(),
		})
		.nullable(),
});

export const quoteListOutput = z.object({
	rows: z.array(quoteRowOutput),
	truncated: z.boolean(),
	stage: z.enum(Object.values(DealStage) as [DealStage, ...DealStage[]]),
	unit: z.string(),
});

export const quoteThreadInput = z.object({ threadId: z.string().min(1) });

export const quoteCreatedOutput = z.object({
	threadId: z.string(),
	dealId: z.string(),
	contactId: z.string().nullable(),
});

export const quoteDismissedOutput = z.object({ threadId: z.string() });

export type QuoteListOutput = z.infer<typeof quoteListOutput>;
export type QuoteThreadInput = z.infer<typeof quoteThreadInput>;
