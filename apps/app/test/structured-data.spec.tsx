import { afterEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
	organisationEntry,
	StructuredData,
	serialiseEntry,
	softwareEntry,
} from "../components/landing/structured-data";

const ORG_KEYS = [
	"ORG_CONTACT_EMAIL",
	"ORG_CONTACT_PHONE",
	"ORG_STREET_ADDRESS",
	"ORG_POSTAL_CODE",
	"ORG_ADDRESS_LOCALITY",
	"ORG_ADDRESS_COUNTRY",
] as const;

function clearOrgEnv() {
	for (const key of ORG_KEYS) delete process.env[key];
}

afterEach(clearOrgEnv);

describe("the homepage structured data", () => {
	it("renders one native ld+json script per entry", () => {
		clearOrgEnv();
		const html = renderToStaticMarkup(<StructuredData />);
		const payloads = [
			...html.matchAll(
				/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
			),
		].map((match) => JSON.parse(match[1] ?? ""));

		expect(payloads).toHaveLength(2);
		expect(payloads.map((entry) => entry["@type"])).toEqual([
			"SoftwareApplication",
			"Organization",
		]);
		for (const entry of payloads) {
			expect(entry["@context"]).toBe("https://schema.org");
		}
	});

	it("leaves an ampersand intact so the payload stays valid JSON", () => {
		const html = renderToStaticMarkup(
			<script type="application/ld+json">
				{serialiseEntry({ url: "https://example.com/?a=1&b=2" })}
			</script>,
		);
		const body = html.slice(
			html.indexOf(">") + 1,
			html.lastIndexOf("</script>"),
		);

		expect(body).toContain("&b=2");
		expect(JSON.parse(body)).toEqual({ url: "https://example.com/?a=1&b=2" });
	});

	it("escapes a closing tag so a string cannot break out of the script", () => {
		const payload = serialiseEntry({ name: "</script><img src=x>" });

		expect(payload).not.toContain("<");
		expect(payload).toContain("\\u003c/script");
	});

	it("describes the product with the brand name and a free offer", () => {
		const entry = softwareEntry();

		expect(entry["@type"]).toBe("SoftwareApplication");
		expect(entry.name).toBe("Reloop CRM");
		expect(entry.description.length).toBeGreaterThan(0);
		expect(entry.url).toBeDefined();
		expect(entry.offers).toEqual({
			"@type": "Offer",
			price: "0",
			priceCurrency: "EUR",
		});
		expect(entry.sameAs).toEqual(["https://github.com/reloopcrm/reloop"]);
	});

	it("omits contactPoint and address when no variable is set", () => {
		clearOrgEnv();
		const entry = organisationEntry();

		expect(entry["@type"]).toBe("Organization");
		expect(entry.name).toBe("Reloop");
		expect(entry).not.toHaveProperty("contactPoint");
		expect(entry).not.toHaveProperty("address");
	});

	it("adds contactPoint and address when the variables are set", () => {
		process.env.ORG_CONTACT_EMAIL = "support@example.com";
		process.env.ORG_CONTACT_PHONE = "+49 30 000000";
		process.env.ORG_STREET_ADDRESS = "Beispielweg 1";
		process.env.ORG_POSTAL_CODE = "10115";
		process.env.ORG_ADDRESS_LOCALITY = "Berlin";
		process.env.ORG_ADDRESS_COUNTRY = "DE";

		const entry = organisationEntry();

		expect(entry.contactPoint).toEqual({
			"@type": "ContactPoint",
			contactType: "customer support",
			email: "support@example.com",
			telephone: "+49 30 000000",
		});
		expect(entry.address).toEqual({
			"@type": "PostalAddress",
			streetAddress: "Beispielweg 1",
			postalCode: "10115",
			addressLocality: "Berlin",
			addressCountry: "DE",
		});
	});

	it("keeps a partial contactPoint and a partial address", () => {
		clearOrgEnv();
		process.env.ORG_CONTACT_EMAIL = "support@example.com";
		process.env.ORG_ADDRESS_COUNTRY = "DE";

		const entry = organisationEntry();

		expect(entry.contactPoint).toEqual({
			"@type": "ContactPoint",
			contactType: "customer support",
			email: "support@example.com",
		});
		expect(entry.address).toEqual({
			"@type": "PostalAddress",
			addressCountry: "DE",
		});
	});

	it("drops an empty or oversized variable instead of throwing", () => {
		clearOrgEnv();
		process.env.ORG_CONTACT_EMAIL = "   ";
		process.env.ORG_ADDRESS_LOCALITY = "x".repeat(500);
		process.env.ORG_ADDRESS_COUNTRY = "DE";

		const entry = organisationEntry();

		expect(entry).not.toHaveProperty("contactPoint");
		expect(entry.address).toEqual({
			"@type": "PostalAddress",
			addressCountry: "DE",
		});
	});
});

describe("the homepage metadata", () => {
	it("declares a canonical URL", async () => {
		const source = await readFile(
			join(process.cwd(), "app", "(landing)", "page.tsx"),
			"utf8",
		);

		expect(source).toContain('alternates: { canonical: "/" }');
		expect(source).not.toContain("next/script");
	});
});
