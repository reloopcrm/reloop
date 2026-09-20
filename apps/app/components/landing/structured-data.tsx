import { BRAND } from "@crm/ui/lib/brand";
import { z } from "zod";
import { REPO_URL } from "@/components/landing/site";
import { siteAddress } from "@/lib/site-address";

const PRODUCT_NAME = `${BRAND.name} CRM`;

const PRODUCT_DESCRIPTION =
	"Open-source, self-hosted CRM that reads your mailbox history and tells you which past customers are worth winning back.";

export const ORGANISATION = {
	contactType: "customer support",
	applicationCategory: "BusinessApplication",
	operatingSystem: "Linux, macOS, Docker",
	license: "https://spdx.org/licenses/AGPL-3.0-only.html",
	priceCurrency: "EUR",
} as const;

const optionalField = z
	.string()
	.trim()
	.min(1)
	.max(200)
	.optional()
	.catch(undefined);

const organisationEnv = z.object({
	email: optionalField,
	phone: optionalField,
	streetAddress: optionalField,
	postalCode: optionalField,
	addressLocality: optionalField,
	addressCountry: optionalField,
});

type OrganisationEnv = z.infer<typeof organisationEnv>;

function readOrganisationEnv(): OrganisationEnv {
	return organisationEnv.parse({
		email: process.env.ORG_CONTACT_EMAIL,
		phone: process.env.ORG_CONTACT_PHONE,
		streetAddress: process.env.ORG_STREET_ADDRESS,
		postalCode: process.env.ORG_POSTAL_CODE,
		addressLocality: process.env.ORG_ADDRESS_LOCALITY,
		addressCountry: process.env.ORG_ADDRESS_COUNTRY,
	});
}

type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| { [key: string]: JsonValue | undefined };

export type StructuredDataEntry = { [key: string]: JsonValue | undefined };

function contactPointOf({ email, phone }: OrganisationEnv) {
	if (!email && !phone) return undefined;

	const point: StructuredDataEntry = {
		"@type": "ContactPoint",
		contactType: ORGANISATION.contactType,
	};

	if (email) point.email = email;
	if (phone) point.telephone = phone;

	return point;
}

function postalAddressOf({
	streetAddress,
	postalCode,
	addressLocality,
	addressCountry,
}: OrganisationEnv) {
	if (!streetAddress && !postalCode && !addressLocality && !addressCountry) {
		return undefined;
	}

	const postal: StructuredDataEntry = { "@type": "PostalAddress" };

	if (streetAddress) postal.streetAddress = streetAddress;
	if (postalCode) postal.postalCode = postalCode;
	if (addressLocality) postal.addressLocality = addressLocality;
	if (addressCountry) postal.addressCountry = addressCountry;

	return postal;
}

export function softwareEntry() {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: PRODUCT_NAME,
		applicationCategory: ORGANISATION.applicationCategory,
		operatingSystem: ORGANISATION.operatingSystem,
		description: PRODUCT_DESCRIPTION,
		url: siteAddress()?.toString(),
		license: ORGANISATION.license,
		isAccessibleForFree: true,
		codeRepository: REPO_URL,
		sameAs: [REPO_URL],
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: ORGANISATION.priceCurrency,
		},
	};
}

export function organisationEntry() {
	const values = readOrganisationEnv();
	const contactPoint = contactPointOf(values);
	const address = postalAddressOf(values);

	const entry: StructuredDataEntry = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: BRAND.name,
		description: PRODUCT_DESCRIPTION,
		url: siteAddress()?.toString(),
		sameAs: [REPO_URL],
	};

	if (contactPoint) entry.contactPoint = contactPoint;
	if (address) entry.address = address;

	return entry;
}

export function serialiseEntry(entry: StructuredDataEntry): string {
	return JSON.stringify(entry).replace(/</g, "\\u003c");
}

export function StructuredData() {
	return (
		<>
			{[softwareEntry(), organisationEntry()].map((entry) => (
				<script key={String(entry["@type"])} type="application/ld+json">
					{serialiseEntry(entry)}
				</script>
			))}
		</>
	);
}
