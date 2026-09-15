import { describe, expect, it } from "bun:test";
import {
	domainFromEmail,
	isMachineDomain,
	normalizeDomain,
} from "../src/companies/domain";

describe("normalizeDomain", () => {
	it("reduces anything a human might type to the bare host", () => {
		for (const input of [
			"stripe.com",
			"STRIPE.com",
			"  stripe.com  ",
			"www.stripe.com",
			"https://stripe.com",
			"https://www.Stripe.com/pricing?ref=x",
			"http://stripe.com/",
		]) {
			expect(normalizeDomain(input)).toBe("stripe.com");
		}
	});

	it("rejects things that are not hostnames", () => {
		for (const input of [
			"",
			"   ",
			"localhost",
			"my company",
			"not a domain",
		]) {
			expect(normalizeDomain(input)).toBeNull();
		}
		expect(normalizeDomain(null)).toBeNull();
		expect(normalizeDomain(undefined)).toBeNull();
	});
});

describe("domainFromEmail", () => {
	it("takes the domain off a work address", () => {
		expect(domainFromEmail("ada@stripe.com")).toBe("stripe.com");
		expect(domainFromEmail("  Ada@WWW.Stripe.com ")).toBe("stripe.com");
	});

	it("ignores free and malformed addresses", () => {
		for (const email of [
			"ada@gmail.com",
			"ada@outlook.com",
			"ada@proton.me",
			"@stripe.com",
			"not-an-email",
			"",
		]) {
			expect(domainFromEmail(email)).toBeNull();
		}
	});

	it("ignores the mailbox providers a German trader meets", () => {
		for (const email of [
			"hans@web.de",
			"hans@t-online.de",
			"hans@freenet.de",
			"hans@gmx.net",
			"hans@posteo.de",
			"hans@arcor.de",
			"hans@mailbox.org",
			"hans@yahoo.de",
			"hans@hotmail.de",
			"hans@outlook.de",
			"hans@live.de",
			"hans@aol.de",
			"hans@1und1.de",
			"hans@vodafone.de",
			"hans@gmx.at",
			"hans@a1.net",
			"hans@bluewin.ch",
			"hans@wp.pl",
			"hans@seznam.cz",
			"hans@laposte.net",
		]) {
			expect(domainFromEmail(email)).toBeNull();
		}
	});

	it("still takes the domain off a real trading partner", () => {
		for (const [email, domain] of [
			["einkauf@paletten-mueller.de", "paletten-mueller.de"],
			["hans@hostinger.com", "hostinger.com"],
			["a@t-systems.com", "t-systems.com"],
		]) {
			expect(domainFromEmail(email)).toBe(domain as string);
		}
	});

	it("never derives a company from infrastructure", () => {
		for (const email of [
			"c_f5ecd6a22aea945a2d5c6ac9b8b2b16b@group.calendar.google.com",
			"list@googlegroups.com",
			"reply@em1234.amazonses.com",
		]) {
			expect(domainFromEmail(email)).toBeNull();
		}
	});
});

describe("isMachineDomain", () => {
	it("is false for a real host and for nothing", () => {
		expect(isMachineDomain("stripe.com")).toBe(false);
		expect(isMachineDomain("calendar.acme.com")).toBe(false);
		expect(isMachineDomain(null)).toBe(false);
		expect(isMachineDomain("")).toBe(false);
	});
});
