import { db } from "@crm/db";
import { blobEnabled, isMirrored, mirror } from "@crm/db/blob";
import { COPY } from "./copy";
import { say } from "./language";
import { findPortrait, type PortraitSource } from "./portrait-sources";

export type PortraitResult = {
	stored: boolean;
	imageUrl: string | null;
	source?: PortraitSource;
	reason?: string;
};

export async function storePortrait({
	contactId,
	sourceUrl,
	verified,
	force = false,
}: {
	contactId: string;
	sourceUrl: string | null;
	verified: boolean;
	force?: boolean;
}): Promise<PortraitResult> {
	if (!sourceUrl) {
		return {
			stored: false,
			imageUrl: null,
			reason: say(COPY.portraits.noPhoto),
		};
	}

	if (!verified) {
		return {
			stored: false,
			imageUrl: null,
			reason: say(COPY.portraits.notTheirs),
		};
	}

	if (!blobEnabled()) {
		return {
			stored: false,
			imageUrl: null,
			reason: say(COPY.portraits.noStoreExpiring),
		};
	}

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { imageUrl: true },
	});

	if (!contact) {
		return {
			stored: false,
			imageUrl: null,
			reason: say(COPY.portraits.noContact),
		};
	}

	if (!force && isMirrored(contact.imageUrl)) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: say(COPY.portraits.hasPhoto),
		};
	}

	const stored = await mirror(sourceUrl, `contacts/${contactId}`);

	if (!stored) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: say(COPY.portraits.fetchFailed),
		};
	}

	if (stored === contact.imageUrl) {
		return {
			stored: false,
			imageUrl: stored,
			reason: say(COPY.portraits.unchanged),
		};
	}

	await db.contact.update({
		where: { id: contactId },
		data: { imageUrl: stored },
	});

	return { stored: true, imageUrl: stored };
}

export async function runPortrait({
	contactId,
	force = false,
}: {
	contactId: string;
	force?: boolean;
}): Promise<PortraitResult> {
	if (!blobEnabled()) {
		return {
			stored: false,
			imageUrl: null,
			reason: say(COPY.portraits.noStore),
		};
	}

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			imageUrl: true,
			githubUrl: true,
		},
	});

	if (!contact) {
		return {
			stored: false,
			imageUrl: null,
			reason: say(COPY.portraits.noContact),
		};
	}

	if (!force && contact.imageUrl) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: say(COPY.portraits.hasPhoto),
		};
	}

	const found = findPortrait({
		id: contact.id,
		name:
			[contact.firstName, contact.lastName].filter(Boolean).join(" ") || null,
		githubUrl: contact.githubUrl,
	});

	if (!found.found) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: say(COPY.portraits.nothingPoints),
		};
	}

	const result = await storePortrait({
		contactId,
		sourceUrl: found.candidate.url,
		verified: true,
		force,
	});

	return { ...result, source: found.candidate.source };
}
