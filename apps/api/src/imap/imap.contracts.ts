import { GoogleSyncStatus } from "@crm/db";
import { z } from "zod";

const syncStatusOutput = z.enum(
	Object.values(GoogleSyncStatus) as [GoogleSyncStatus, ...GoogleSyncStatus[]],
);

export const imapAccountIdInput = z.object({ id: z.string().min(1) });

export const IMAP_CREATE_FROM = [
	"relevant",
	"everyone",
	"replied",
	"nobody",
] as const;
export const imapCreateFrom = z.enum(IMAP_CREATE_FROM);
export type ImapCreateFrom = z.infer<typeof imapCreateFrom>;

export const addImapAccountInput = z.object({
	email: z.string().trim().email().max(254),
	host: z.string().trim().min(1).max(253),
	port: z.number().int().min(1).max(65535),
	secure: z.boolean(),
	username: z.string().trim().min(1).max(254),
	password: z.string().min(1).max(1024),
	importSince: z.string().datetime().nullable(),
	createFrom: imapCreateFrom,
});

export const setImapCreateFromInput = z.object({
	id: z.string().min(1),
	createFrom: imapCreateFrom,
});

export const imapAccountOutput = z.object({
	id: z.string(),
	email: z.string(),
	host: z.string(),
	port: z.number(),
	secure: z.boolean(),
	username: z.string(),
	importSince: z.string().nullable(),
	status: syncStatusOutput.nullable(),
	lastSyncedAt: z.string().nullable(),
	lastError: z.string().nullable(),
	createFrom: imapCreateFrom,
	backlog: z.number(),
	messages: z.number(),
	createdAt: z.string(),
});

export const imapStatusOutput = z.object({
	linked: z.boolean(),
	accounts: z.array(imapAccountOutput),
});

export const imapPurgeOutput = z.object({ purged: z.number() });

export const imapRemoveOutput = z.object({ removed: z.boolean() });

export type AddImapAccountInput = z.infer<typeof addImapAccountInput>;
export type ImapAccountOutput = z.infer<typeof imapAccountOutput>;
export type ImapStatus = z.infer<typeof imapStatusOutput>;
export type ImapPurgeOutput = z.infer<typeof imapPurgeOutput>;
export type ImapRemoveOutput = z.infer<typeof imapRemoveOutput>;
