import { db, EnrichmentStatus } from "@crm/db";
import { mirrorBrandImages } from "./brand-images";
import { brandToUpdate, filledFields, stillFillable } from "./brand-mapping";
import { COPY } from "./copy";
import { UNLESS_COMPLETE } from "./enrichment";
import { say } from "./language";
import { brandFromWebsite } from "./website-brand";

export type BrandResult = {
	enriched: boolean;
	filled?: string[];
	mirrored?: string[];
	reason?: string;
	retryable?: boolean;
};

const COMPANY_FIELDS = {
	id: true,
	name: true,
	domain: true,
	description: true,
	logoUrl: true,
	logoDarkUrl: true,
	iconUrl: true,
	iconDarkUrl: true,
	iconTone: true,
	brandColor: true,
	industry: true,
	subIndustry: true,
	city: true,
	stateCode: true,
	country: true,
	countryCode: true,
	phone: true,
	email: true,
	linkedinUrl: true,
	twitterUrl: true,
	githubUrl: true,
	pricingUrl: true,
	careersUrl: true,
} as const;

export async function runBrand({
	companyId,
}: {
	companyId: string;
}): Promise<BrandResult> {
	const company = await db.company.findUnique({
		where: { id: companyId },
		select: COMPANY_FIELDS,
	});

	if (!company) return { enriched: false, reason: say(COPY.brand.noCompany) };

	if (!company.domain) {
		await settle(
			companyId,
			EnrichmentStatus.SKIPPED,
			say(COPY.brand.noDomainToLookUp),
			UNLESS_COMPLETE,
		);
		return { enriched: false, reason: say(COPY.brand.noDomain) };
	}

	await db.company.updateMany({
		where: { id: companyId, ...UNLESS_COMPLETE },
		data: {
			enrichmentStatus: EnrichmentStatus.RUNNING,
			enrichmentError: null,
		},
	});

	const result = await brandFromWebsite(company.domain);

	if (result.outcome === "skipped") {
		await settle(companyId, EnrichmentStatus.SKIPPED, result.reason);
		return { enriched: false, reason: result.reason };
	}

	if (result.outcome === "failed") {
		await settle(companyId, EnrichmentStatus.FAILED, result.reason);
		return {
			enriched: false,
			reason: result.reason,
			retryable: result.retryable,
		};
	}

	const update = brandToUpdate(result.brand, snapshot(company));

	const { mirrored } = await mirrorBrandImages(companyId, update);

	const filled = await db.$transaction(async (tx) => {
		const current = await tx.company.findUnique({
			where: { id: companyId },
			select: COMPANY_FIELDS,
		});

		if (!current) return null;

		const data = stillFillable(update, snapshot(current));

		await tx.company.update({
			where: { id: companyId },
			data: {
				...data,
				enrichmentStatus: EnrichmentStatus.COMPLETE,
				enrichedAt: new Date(),
				enrichmentError: null,
			},
		});

		await tx.companyEnrichment.upsert({
			where: { companyId },
			create: { companyId, source: "website", raw: result.raw as object },
			update: {
				source: "website",
				raw: result.raw as object,
				fetchedAt: new Date(),
			},
		});

		return filledFields(data);
	});

	if (!filled) return { enriched: false, reason: say(COPY.brand.noCompany) };

	return {
		enriched: true,
		filled,
		mirrored: mirrored.filter((slot) => filled.includes(slot)),
	};
}

function snapshot<T extends { name: string; domain: string | null }>(
	company: T,
) {
	return { ...company, nameIsPlaceholder: company.name === company.domain };
}

export function brandOutcome(result: BrandResult): string {
	if (!result.enriched) return result.reason ?? say(COPY.brand.nothingToFill);

	const filled = result.filled ?? [];
	const mirrored = result.mirrored ?? [];

	if (filled.length === 0) {
		return say(COPY.brand.alreadyThere);
	}

	return say(COPY.brand.filled(filled.join(", "), mirrored.length));
}

type SettleGuard =
	| typeof UNLESS_COMPLETE
	| { enrichmentStatus: EnrichmentStatus };

async function settle(
	companyId: string,
	status: EnrichmentStatus,
	error: string,
	guard: SettleGuard = { enrichmentStatus: EnrichmentStatus.RUNNING },
): Promise<void> {
	await db.company.updateMany({
		where: { id: companyId, ...guard },
		data: { enrichmentStatus: status, enrichmentError: error },
	});
}
