import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import type { ToolContext } from "eve/tools";
import * as crm from "../agent/lib/crm";
import * as facts from "../agent/lib/facts";
import { focus, refund, spend } from "../agent/lib/focus";
import { ask } from "../agent/lib/perplexity";
import { findSocialCandidates, type Person } from "../agent/lib/socials";
import findContactSocials from "../agent/tools/find_contact_socials";
import researchPerson from "../agent/tools/research_person";
import setContactSocials from "../agent/tools/set_contact_socials";
import { inEveContext, researchCtx } from "./eve-context";

const ctx = researchCtx as unknown as ToolContext;

const person: Person = {
	firstName: "Lewis",
	lastName: "Carhart",
	fullName: "Lewis Carhart",
	title: "Engineer",
	companyName: "Fernhill",
	companyDomain: "fernhill.test",
};

type Reply = { status: number; body?: unknown };

let perplexityReply: (domains: string[]) => Reply = () => ({ status: 200 });
let githubReply: () => Reply = () => ({ status: 404 });
const calls: string[] = [];

const answer = (
	text: string,
	citations: string[] | Record<string, number>,
): Reply => ({
	status: 200,
	body: { choices: [{ message: { content: text } }], citations },
});

const toResponse = (reply: Reply) =>
	new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), {
		status: reply.status,
		headers: { "content-type": "application/json" },
	});

const spies = [
	spyOn(globalThis, "fetch").mockImplementation((async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = String(input instanceof Request ? input.url : input);
		calls.push(url);
		if (url.startsWith("https://api.github.com/")) {
			return toResponse(githubReply());
		}
		const body = JSON.parse(String(init?.body ?? "{}")) as {
			search_domain_filter?: string[];
		};
		return toResponse(perplexityReply(body.search_domain_filter ?? []));
	}) as typeof fetch),
	spyOn(crm, "personForVerification").mockImplementation(async () => person),
	spyOn(crm, "stampSocialsChecked").mockImplementation(async () => {}),
	spyOn(facts, "recordFact").mockImplementation(async () => {
		throw new Error("recordFact must not run in these tests");
	}),
];

const stamp = spies[2] as ReturnType<typeof spyOn>;

const savedKey = process.env.PERPLEXITY_API_KEY;

beforeEach(() => {
	process.env.PERPLEXITY_API_KEY = "pplx-test-key";
	calls.length = 0;
	stamp.mockClear();
	perplexityReply = () => ({ status: 200 });
	githubReply = () => ({ status: 404 });
});

afterEach(() => {
	if (savedKey === undefined) delete process.env.PERPLEXITY_API_KEY;
	else process.env.PERPLEXITY_API_KEY = savedKey;
});

afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

const spent = () => focus.get().spent;

describe("refund", () => {
	it("gives back what a failed call was charged, and never goes below zero", async () => {
		await inEveContext(async () => {
			expect(spend(2).ok).toBe(true);
			refund(1);
			expect(spent()).toBe(1);
			refund(5);
			expect(spent()).toBe(0);
		});
	});
});

describe("find_contact_socials", () => {
	it("says the source is missing and spends nothing without a Perplexity key", async () => {
		delete process.env.PERPLEXITY_API_KEY;

		await inEveContext(async () => {
			const result = await findContactSocials.execute(
				{ contactId: "contact-1" },
				ctx,
			);

			expect(result).toMatchObject({ searched: false, configured: false });
			expect(spent()).toBe(0);
		});

		expect(calls).toEqual([]);
		expect(stamp).not.toHaveBeenCalled();
	});

	it("refunds and leaves the contact unstamped when every search fails", async () => {
		perplexityReply = () => ({ status: 429 });

		await inEveContext(async () => {
			const result = await findContactSocials.execute(
				{ contactId: "contact-1" },
				ctx,
			);

			expect(result).toMatchObject({ searched: false, retryable: true });
			expect(spent()).toBe(0);
		});

		expect(stamp).not.toHaveBeenCalled();
	});

	it("charges only the search that answered", async () => {
		perplexityReply = (domains) =>
			domains.includes("github.com")
				? answer("https://github.com/lewiscarhart", [
						"https://github.com/lewiscarhart",
					])
				: { status: 503 };

		await inEveContext(async () => {
			const result = await findContactSocials.execute(
				{ contactId: "contact-1" },
				ctx,
			);

			expect(result).toMatchObject({
				searched: true,
				candidates: { x: [], github: ["https://github.com/lewiscarhart"] },
				unanswered: ["x"],
			});
			expect(spent()).toBe(1);
		});

		expect(stamp).toHaveBeenCalledTimes(1);
	});

	it("charges both searches when both answer", async () => {
		perplexityReply = () => answer("I do not know.", []);

		await inEveContext(async () => {
			const result = await findContactSocials.execute(
				{ contactId: "contact-1" },
				ctx,
			);

			expect(result).toMatchObject({ searched: true, unanswered: [] });
			expect(spent()).toBe(2);
		});

		expect(stamp).toHaveBeenCalledTimes(1);
	});
});

describe("set_contact_socials", () => {
	it("charges one unit for a GitHub account that answered", async () => {
		githubReply = () => ({ status: 404 });

		await inEveContext(async () => {
			const result = await setContactSocials.execute(
				{
					contactId: "contact-1",
					githubUrl: "https://github.com/lewiscarhart",
				},
				ctx,
			);

			expect(result.written).toBe(false);
			expect(spent()).toBe(1);
		});
	});

	it("refunds a GitHub check that was rate limited", async () => {
		githubReply = () => ({ status: 429 });

		await inEveContext(async () => {
			await setContactSocials.execute(
				{
					contactId: "contact-1",
					githubUrl: "https://github.com/lewiscarhart",
				},
				ctx,
			);

			expect(spent()).toBe(0);
		});
	});

	it("charges nothing for an X handle refused before any call", async () => {
		await inEveContext(async () => {
			const result = await setContactSocials.execute(
				{ contactId: "contact-1", twitterUrl: "https://x.com/someoneelse" },
				ctx,
			);

			expect(result.rejected.length).toBe(1);
			expect(spent()).toBe(0);
		});

		expect(calls).toEqual([]);
	});

	it("says the X check is unavailable and calls nothing without a Perplexity key", async () => {
		delete process.env.PERPLEXITY_API_KEY;

		await inEveContext(async () => {
			const result = await setContactSocials.execute(
				{ contactId: "contact-1", twitterUrl: "https://x.com/lewiscarhart" },
				ctx,
			);

			expect(result).toMatchObject({ written: false, configured: false });
			expect(spent()).toBe(0);
		});

		expect(calls).toEqual([]);
	});

	it("still checks GitHub while the X check is unavailable", async () => {
		delete process.env.PERPLEXITY_API_KEY;
		githubReply = () => ({ status: 404 });

		await inEveContext(async () => {
			const result = await setContactSocials.execute(
				{
					contactId: "contact-1",
					twitterUrl: "https://x.com/lewiscarhart",
					githubUrl: "https://github.com/lewiscarhart",
				},
				ctx,
			);

			expect("rejected" in result && result.rejected).toContainEqual(
				expect.stringContaining("no PERPLEXITY_API_KEY"),
			);
			expect(spent()).toBe(1);
		});

		expect(calls).toEqual(["https://api.github.com/users/lewiscarhart"]);
	});

	it("charges nothing for a URL that is not a profile", async () => {
		await inEveContext(async () => {
			await setContactSocials.execute(
				{ contactId: "contact-1", githubUrl: "https://example.com/lewis" },
				ctx,
			);

			expect(spent()).toBe(0);
		});
	});

	it("stops at the budget and says so", async () => {
		perplexityReply = () => answer("Yes.", ["https://x.com/lewiscarhart"]);

		await inEveContext(async () => {
			expect(spend(4).ok).toBe(true);

			const result = await setContactSocials.execute(
				{ contactId: "contact-1", twitterUrl: "https://x.com/lewiscarhart" },
				ctx,
			);

			expect(result.rejected[0]).toContain("Research budget");
			expect(spent()).toBe(4);
		});

		expect(calls).toEqual([]);
	});
});

describe("research_person", () => {
	it("refunds a question the web search did not answer", async () => {
		perplexityReply = () => ({ status: 500 });

		await inEveContext(async () => {
			const result = await researchPerson.execute(
				{ question: "What has Fernhill announced?", deep: true },
				ctx,
			);

			expect(result.ok).toBe(false);
			expect(spent()).toBe(0);
		});
	});

	it("charges a question that answered", async () => {
		perplexityReply = () => answer("Fernhill opened a depot.", []);

		await inEveContext(async () => {
			const result = await researchPerson.execute(
				{ question: "What has Fernhill announced?", deep: false },
				ctx,
			);

			expect(result.ok).toBe(true);
			expect(spent()).toBe(1);
		});
	});
});

describe("a Perplexity answer is parsed at the boundary", () => {
	it("refuses citations that are not a list", async () => {
		perplexityReply = () => answer("https://x.com/lewiscarhart", { a: 1 });

		const result = await ask("question");

		expect(result.ok).toBe(false);
	});

	it("turns an unreadable answer into a failed search, not a throw", async () => {
		perplexityReply = () => answer("https://x.com/lewiscarhart", { a: 1 });

		const result = await findSocialCandidates(person, "x");

		expect(result.ok).toBe(false);
	});

	it("still reads the search results when there are no citations", async () => {
		perplexityReply = () => ({
			status: 200,
			body: {
				choices: [{ message: { content: "See the profile." } }],
				search_results: [{ url: "https://github.com/lewiscarhart" }, {}],
			},
		});

		const result = await findSocialCandidates(person, "github");

		expect(result).toEqual({
			ok: true,
			candidates: [
				{
					network: "github",
					handle: "lewiscarhart",
					url: "https://github.com/lewiscarhart",
				},
			],
			citations: ["https://github.com/lewiscarhart"],
		});
	});
});
