import { describe, expect, it } from "bun:test";
import { mailboxProfile, parseMailboxProfile } from "../src/mailbox-profile";

const profile = {
	v: 1,
	learnedAt: "2026-09-30T08:00:00.000Z",
	basedOnThreads: 60,
	business: {
		side: "both",
		measure: "quantity",
		currency: "EUR",
		bulkUnit: "truck loads",
		minAmount: 5000,
		dealMeans: "A confirmed order with a pickup date.",
	},
	counterparts: {
		freemail: "common",
		roleAddresses: "rare",
		note: "Many small buyers write from personal addresses.",
	},
	languages: ["de", "en-GB"],
	followUp: {
		toSeller: ["Do you have {product} available again?"],
		toBuyer: ["We have {product} ready for pickup."],
	},
};

describe("mailboxProfile", () => {
	it("accepts a full profile unchanged", () => {
		expect(parseMailboxProfile(profile)).toEqual({ ok: true, profile });
	});

	it("rejects an unknown side", () => {
		const result = parseMailboxProfile({
			...profile,
			business: { ...profile.business, side: "rents" },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain("business.side");
	});

	it("rejects values out of range instead of clamping them", () => {
		expect(
			mailboxProfile.safeParse({ ...profile, basedOnThreads: -1 }).success,
		).toBe(false);
		expect(
			mailboxProfile.safeParse({
				...profile,
				business: { ...profile.business, bulkUnit: "x".repeat(31) },
			}).success,
		).toBe(false);
		expect(
			mailboxProfile.safeParse({
				...profile,
				followUp: { ...profile.followUp, toBuyer: ["a", "b", "c", "d", "e"] },
			}).success,
		).toBe(false);
		expect(
			mailboxProfile.safeParse({
				...profile,
				business: { ...profile.business, currency: "eur" },
			}).success,
		).toBe(false);
	});

	it("reports garbage with a reason", () => {
		for (const value of [null, "profile", 42, { v: 2 }]) {
			const result = parseMailboxProfile(value);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
		}
	});
});
