import { z } from "zod";

export const IMPRINT_ROBOTS = { index: false, follow: true } as const;

const optionalField = z
	.string()
	.trim()
	.min(1)
	.max(200)
	.optional()
	.catch(undefined);

const imprintEnv = z.object({
	name: optionalField,
	business: optionalField,
	address: optionalField,
	email: optionalField,
	vatId: optionalField,
	phone: optionalField,
});

export type Imprint = {
	name: string;
	business: string | null;
	addressLines: string[];
	email: string | null;
	vatId: string | null;
	phone: string | null;
};

function addressLinesOf(address: string | undefined): string[] {
	if (!address) return [];
	return address
		.split(/\r?\n|;/)
		.map((line) => line.trim())
		.filter(Boolean);
}

export function getImprint(): Imprint | null {
	const env = imprintEnv.parse({
		name: process.env.RELOOP_IMPRINT_NAME,
		business: process.env.RELOOP_IMPRINT_BUSINESS,
		address: process.env.RELOOP_IMPRINT_ADDRESS,
		email: process.env.RELOOP_IMPRINT_EMAIL,
		vatId: process.env.RELOOP_IMPRINT_VAT_ID,
		phone: process.env.RELOOP_IMPRINT_PHONE,
	});

	if (!env.name) return null;

	return {
		name: env.name,
		business: env.business ?? null,
		addressLines: addressLinesOf(env.address),
		email: env.email ?? null,
		vatId: env.vatId ?? null,
		phone: env.phone ?? null,
	};
}
