import { type Db, Prisma } from "@crm/db";
import { AUTO_REPLY_BODY_CHARS } from "@crm/db/message-text";
import { z } from "zod";
import type { Participant } from "./participants";

const storedRecipient = z.object({
	email: z.string().trim().min(1),
	name: z.string().nullable().catch(null),
});

const storedRecipients = z.array(z.json()).catch([]);

export function recipientsOf(value: Prisma.JsonValue): Participant[] {
	return storedRecipients.parse(value).flatMap((entry) => {
		const parsed = storedRecipient.safeParse(entry);
		if (!parsed.success) return [];

		return [{ email: parsed.data.email.toLowerCase(), name: parsed.data.name }];
	});
}

const isoInstant = z.iso.datetime().transform((value) => new Date(value));

const scannedMessage = z.object({
	threadId: z.string(),
	direction: z.enum(["INBOUND", "OUTBOUND"]),
	fromEmail: z.string(),
	fromName: z.string().nullable(),
	subject: z.string().nullable(),
	body: z.string().nullable(),
	snippet: z.string().nullable(),
	syncedByUserId: z.string().nullable(),
	sentAt: isoInstant,
	recipients: z.json(),
});

const scannedMessages = z.array(scannedMessage);

export type ScannedMessage = Omit<
	z.infer<typeof scannedMessage>,
	"recipients"
> & { recipients: string[] };

export async function readThreadMessages(
	client: Db | Prisma.TransactionClient,
	threadIds: readonly string[],
): Promise<ScannedMessage[]> {
	if (threadIds.length === 0) return [];

	const raw = await client.$queryRaw<unknown[]>`
		SELECT m."threadId",
			m.direction::text AS direction,
			m."fromEmail",
			m."fromName",
			m.subject,
			left(m.body, ${AUTO_REPLY_BODY_CHARS}) AS body,
			m.snippet,
			m."syncedByUserId",
			to_char(m."sentAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "sentAt",
			CASE WHEN m.direction = 'OUTBOUND' THEN m.recipients ELSE '[]'::jsonb END AS recipients
		FROM "emailMessage" m
		WHERE m."threadId" IN (${Prisma.join([...threadIds])})
		ORDER BY m."threadId", m."sentAt"
	`;

	return scannedMessages.parse(raw).map((message) => ({
		...message,
		recipients: recipientsOf(message.recipients as Prisma.JsonValue).map(
			(person) => person.email,
		),
	}));
}

export function groupByThread<Message extends { threadId: string }>(
	messages: readonly Message[],
): Map<string, Message[]> {
	const byThread = new Map<string, Message[]>();
	for (const message of messages) {
		const list = byThread.get(message.threadId) ?? [];
		list.push(message);
		byThread.set(message.threadId, list);
	}
	return byThread;
}
