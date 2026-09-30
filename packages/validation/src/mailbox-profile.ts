import type { Db } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { z } from "zod";

const frequency = z.enum(["common", "rare"]);
const followUpLine = z.string().trim().min(1).max(200);

export const mailboxProfile = z.object({
	v: z.literal(1),
	learnedAt: z.iso.datetime(),
	basedOnThreads: z.number().int().min(0),
	business: z.object({
		side: z.enum(["sells", "buys", "both", "unclear"]),
		measure: z.enum(["quantity", "money", "both"]),
		currency: z
			.string()
			.regex(/^[A-Z]{3}$/)
			.nullable(),
		bulkUnit: z.string().trim().min(1).max(30).nullable(),
		minAmount: z.number().min(0).nullable(),
		dealMeans: z.string().trim().max(300),
	}),
	counterparts: z.object({
		freemail: frequency,
		roleAddresses: frequency,
		note: z.string().trim().max(300),
	}),
	languages: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)).max(5),
	followUp: z.object({
		toSeller: z.array(followUpLine).max(4),
		toBuyer: z.array(followUpLine).max(4),
	}),
});

export type MailboxProfile = z.infer<typeof mailboxProfile>;

export type ParsedMailboxProfile =
	| { ok: true; profile: MailboxProfile }
	| { ok: false; reason: string };

export function parseMailboxProfile(value: unknown): ParsedMailboxProfile {
	const parsed = mailboxProfile.safeParse(value);
	if (parsed.success) return { ok: true, profile: parsed.data };

	return {
		ok: false,
		reason: parsed.error.issues
			.map((issue) => `${issue.path.join(".") || "profile"} ${issue.message}`)
			.join("; "),
	};
}

export async function readMailboxProfile(
	db: Db,
): Promise<ParsedMailboxProfile | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { mailboxProfile: true },
	});

	if (row?.mailboxProfile === null || row?.mailboxProfile === undefined) {
		return null;
	}

	return parseMailboxProfile(row.mailboxProfile);
}

export async function writeMailboxProfile(
	db: Db,
	profile: MailboxProfile,
): Promise<MailboxProfile> {
	const clean = mailboxProfile.parse(profile);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, mailboxProfile: clean },
		update: { mailboxProfile: clean },
	});

	return clean;
}
