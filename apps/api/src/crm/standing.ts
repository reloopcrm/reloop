import {
	CONTACT_POTENTIAL,
	CONTACT_STANDING,
	type ContactPotential,
	type ContactStanding,
} from "@crm/db/contact-standing";
import { z } from "zod";

const STANDINGS = Object.values(CONTACT_STANDING) as [
	ContactStanding,
	...ContactStanding[],
];

const POTENTIALS = Object.values(CONTACT_POTENTIAL) as [
	ContactPotential,
	...ContactPotential[],
];

const standingSet: ReadonlySet<string> = new Set(STANDINGS);

const potentialSet: ReadonlySet<string> = new Set(POTENTIALS);

export const standingFacetInput = z
	.array(z.string())
	.refine((values) => values.every((value) => standingSet.has(value)), {
		message: `Standing must be one of: ${STANDINGS.join(", ")}.`,
	});

export const potentialFacetInput = z
	.array(z.string())
	.refine((values) => values.every((value) => potentialSet.has(value)), {
		message: `Potential must be one of: ${POTENTIALS.join(", ")}.`,
	});

export const standingOutput = z.enum(STANDINGS).nullable();

export const potentialOutput = z.enum(POTENTIALS).nullable();

export function readStanding(value: string | null): ContactStanding | null {
	const read = standingOutput.safeParse(value);
	return read.success ? read.data : null;
}

export function readPotential(value: string | null): ContactPotential | null {
	const read = potentialOutput.safeParse(value);
	return read.success ? read.data : null;
}
