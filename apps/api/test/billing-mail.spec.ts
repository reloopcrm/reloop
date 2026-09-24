import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { LOCALES } from "@crm/db/locale";
import { NO_BILLING, type Tenant } from "@crm/db/tenancy";
import { BillingMailService } from "../src/mail/billing-mail.service";
import { BILLING_MAIL_KINDS, billingMail } from "../src/mail/billing-mail-copy";
import type { MailService } from "../src/mail/mail.service";

const DASHES = /[–—―]/;

const details = {
	plan: "Standard",
	amount: { value: 79, currency: "EUR" },
	date: new Date("2026-10-06T00:00:00.000Z"),
	days: 30,
	invoiceUrl: "https://invoice.stripe.test/in_1",
	pdfUrl: "https://invoice.stripe.test/in_1.pdf",
	billingUrl: "https://app.example/settings/billing",
};

describe("billing mails", () => {
	it("fill every placeholder in every language and use no dash", () => {
		for (const locale of LOCALES) {
			for (const kind of BILLING_MAIL_KINDS) {
				const mail = billingMail({
					...details,
					to: "owner@example.com",
					locale,
					kind,
				});
				expect(`${mail.subject}${mail.text}`).not.toMatch(/\{\w+\}/);
				expect(`${mail.subject}${mail.text}`).not.toMatch(DASHES);
				expect(mail.html.startsWith("<!doctype html>")).toBe(true);
			}
		}
	});

	it("link the hosted invoice and the PDF after a payment", () => {
		const mail = billingMail({
			...details,
			to: "owner@example.com",
			locale: "de",
			kind: "paid",
		});
		expect(mail.subject).toBe("Dein Reloop Tarif Standard ist aktiv");
		expect(mail.html).toContain('href="https://invoice.stripe.test/in_1"');
		expect(mail.html).toContain('href="https://invoice.stripe.test/in_1.pdf"');
	});

	it("drop the pause line when no date is known", () => {
		const mail = billingMail({
			...details,
			date: null,
			to: "owner@example.com",
			locale: "en",
			kind: "failed",
		});
		expect(mail.text).not.toContain("pauses");
		expect(mail.text).toContain("€79.00");
	});

	it("send nothing and throw nothing without mail settings", async () => {
		const mail = { configured: false } as MailService;
		const service = new BillingMailService({} as Db, mail);
		const tenant = { id: "acme", billing: NO_BILLING } as unknown as Tenant;
		expect(await service.send(tenant, "paid:in_1", "paid", {})).toBe(false);
	});
});
