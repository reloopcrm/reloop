import type { Prisma } from "./generated/prisma/client";

export const THREAD_CONTACT_ROLE = {
	sender: "SENDER",
	recipient: "RECIPIENT",
} as const;

export type ThreadContactRole =
	(typeof THREAD_CONTACT_ROLE)[keyof typeof THREAD_CONTACT_ROLE];

export function threadsOfContact(
	contactId: string,
): Prisma.EmailThreadWhereInput {
	return { OR: [{ contactId }, { participants: { some: { contactId } } }] };
}
