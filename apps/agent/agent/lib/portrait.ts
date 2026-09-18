import { db } from "@crm/db";
import { blobEnabled, isMirrored, mirror } from "@crm/db/blob";
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
			reason: "No photo on the profile.",
		};
	}

	if (!verified) {
		return {
			stored: false,
			imageUrl: null,
			reason:
				"The profile was not established to be this person, so its photo is not theirs to use.",
		};
	}

	if (!blobEnabled()) {
		return {
			stored: false,
			imageUrl: null,
			reason:
				"This install has no BLOB_READ_WRITE_TOKEN, so there is nowhere to keep a copy. " +
				"The source URL expires within weeks and is never stored. Retrying will not help.",
		};
	}

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { imageUrl: true },
	});

	if (!contact) {
		return { stored: false, imageUrl: null, reason: "No such contact." };
	}

	if (!force && isMirrored(contact.imageUrl)) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: "They already have a photo.",
		};
	}

	const stored = await mirror(sourceUrl, `contacts/${contactId}`);

	if (!stored) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: "The photo could not be fetched. The record is unchanged.",
		};
	}

	if (stored === contact.imageUrl) {
		return { stored: false, imageUrl: stored, reason: "Unchanged." };
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
			reason:
				"This install has no BLOB_READ_WRITE_TOKEN, so there is nowhere to keep a copy. Retrying will not help.",
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
		return { stored: false, imageUrl: null, reason: "No such contact." };
	}

	if (!force && contact.imageUrl) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: "They already have a photo.",
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
			reason:
				"Nothing on this contact points at a picture. The record carries no GitHub account.",
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
