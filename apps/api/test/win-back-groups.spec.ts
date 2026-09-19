import { describe, expect, it } from "bun:test";
import {
	groupCandidates,
	type ReactivationCandidate,
} from "@crm/db/reactivation";
import {
	countBands,
	countPeople,
	filterBands,
	groupName,
	pageOf,
	searchGroups,
	sortGroups,
} from "../src/reactivation/win-back-groups";

function person(over: {
	id: string;
	firstName?: string;
	lastName?: string | null;
	email?: string | null;
	company?: { id: string; name: string } | null;
	potential?: string;
	standing?: string | null;
	points?: number;
	feedback?: string | null;
	lastContactAt?: string;
	didBusiness?: number;
	maxPallets?: number | null;
	waitingOnUs?: boolean;
}): ReactivationCandidate {
	return {
		contact: {
			id: over.id,
			firstName: over.firstName ?? "Ada",
			lastName: over.lastName ?? null,
			email: over.email ?? null,
			title: null,
			imageUrl: null,
			company: over.company ?? null,
			owner: null,
		},
		standing: over.standing ?? null,
		potential: over.potential ?? "low",
		lastContactAt: new Date(over.lastContactAt ?? "2026-01-01T00:00:00.000Z"),
		firstContactAt: new Date("2025-01-01T00:00:00.000Z"),
		lastInboundAt: null,
		lastOutboundAt: null,
		lastInboundThreadId: null,
		lastOutboundThreadId: null,
		quietDays: 30,
		threads: 1,
		messagesFromThem: 1,
		messagesFromUs: 1,
		meetings: 0,
		openDeals: 0,
		wonDeals: 0,
		lastSubject: null,
		waitingOnUs: over.waitingOnUs ?? false,
		matchedKeyword: null,
		memory: {
			summary: null,
			didBusiness: over.didBusiness ?? 0,
			openInquiries: 0,
			maxPallets: over.maxPallets ?? null,
			products: [],
			lastOutcome: null,
			threadsRead: 1,
		},
		feedback: over.feedback ?? null,
		points: over.points ?? 10,
		pointLines: [],
		reasons: [],
	};
}

const acme = { id: "co1", name: "Acme Paletten" };

describe("one row per company", () => {
	it("puts everybody from one company in one group", () => {
		const groups = groupCandidates([
			person({ id: "a", company: acme }),
			person({ id: "b", company: acme }),
			person({ id: "c", company: { id: "co2", name: "Bravo" } }),
		]);

		expect(groups).toHaveLength(2);
		expect(groups[0]?.people).toHaveLength(2);
		expect(countPeople(groups)).toBe(3);
	});

	it("gives a person without a company their own row", () => {
		const groups = groupCandidates([
			person({ id: "a", firstName: "Solo", email: "solo@example.test" }),
		]);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.company).toBeNull();
		expect(groupName(groups[0] as never)).toBe("Solo");
	});

	it("takes the strongest potential in the company", () => {
		const groups = groupCandidates([
			person({ id: "a", company: acme, potential: "low" }),
			person({ id: "b", company: acme, potential: "high" }),
		]);

		expect(groups[0]?.potential).toBe("high");
	});

	it("stays low when every person is low", () => {
		const groups = groupCandidates([
			person({ id: "a", company: acme, potential: "low", points: 100 }),
			person({ id: "b", company: acme, potential: "low", points: 90 }),
		]);

		expect(groups[0]?.potential).toBe("low");
	});

	it("takes the strongest standing in the company", () => {
		const groups = groupCandidates([
			person({ id: "a", company: acme, standing: "watch" }),
			person({ id: "b", company: acme, standing: "customer" }),
		]);

		expect(groups[0]?.standing).toBe("customer");
	});

	it("adds the facts of everybody up", () => {
		const groups = groupCandidates([
			person({ id: "a", company: acme, didBusiness: 2, maxPallets: 400 }),
			person({ id: "b", company: acme, didBusiness: 1, maxPallets: 900 }),
		]);

		expect(groups[0]?.memory.didBusiness).toBe(3);
		expect(groups[0]?.memory.maxPallets).toBe(900);
	});

	it("shows no verdict while the people disagree", () => {
		const mixed = groupCandidates([
			person({ id: "a", company: acme, feedback: "good" }),
			person({ id: "b", company: acme, feedback: null }),
		]);
		const agreed = groupCandidates([
			person({ id: "a", company: acme, feedback: "good" }),
			person({ id: "b", company: acme, feedback: "good" }),
		]);

		expect(mixed[0]?.feedback).toBeNull();
		expect(agreed[0]?.feedback).toBe("good");
	});

	it("keeps the newest contact of the company", () => {
		const groups = groupCandidates([
			person({
				id: "a",
				company: acme,
				lastContactAt: "2026-01-01T00:00:00.000Z",
			}),
			person({
				id: "b",
				company: acme,
				lastContactAt: "2026-05-01T00:00:00.000Z",
			}),
		]);

		expect(groups[0]?.lastContactAt.toISOString()).toBe(
			"2026-05-01T00:00:00.000Z",
		);
	});
});

describe("searching, filtering and paging the rows", () => {
	const groups = groupCandidates([
		person({ id: "a", company: acme, potential: "high", points: 50 }),
		person({
			id: "b",
			firstName: "Bruno",
			email: "bruno@zulu.test",
			potential: "low",
			points: 20,
		}),
	]);

	it("finds a company by name and a person by address", () => {
		expect(searchGroups(groups, "acme")).toHaveLength(1);
		expect(searchGroups(groups, "zulu.test")).toHaveLength(1);
		expect(searchGroups(groups, "")).toHaveLength(2);
	});

	it("counts and filters the bands", () => {
		expect(countBands(groups)).toEqual({ high: 1, medium: 0, low: 1 });
		expect(filterBands(groups, ["high"])).toHaveLength(1);
		expect(filterBands(groups, [])).toHaveLength(2);
	});

	it("sorts by name in both directions", () => {
		expect(groupName(sortGroups(groups, "name", "asc")[0] as never)).toBe(
			"Acme Paletten",
		);
		expect(groupName(sortGroups(groups, "name", "desc")[0] as never)).toBe(
			"Bruno",
		);
	});

	it("keeps the ranking when no column is chosen", () => {
		expect(sortGroups(groups, "", "desc")[0]?.key).toBe("company:co1");
	});

	it("cuts the list into pages", () => {
		expect(pageOf(groups, 1, 1)).toHaveLength(1);
		expect(pageOf(groups, 2, 1)[0]?.key).toBe("person:b");
		expect(pageOf(groups, 3, 1)).toHaveLength(0);
	});
});
