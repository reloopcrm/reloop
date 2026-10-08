import type { Prisma } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";

export function lockContactEmail(
	tx: Prisma.TransactionClient,
	email: string,
): Promise<void> {
	return lockIdempotencyKey(tx, `contact-email:${email.toLowerCase()}`);
}
