import { defineTool } from "eve/tools";
import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import {
	NOT_LIVE,
	personForVerification,
	stampSocialsChecked,
} from "../lib/crm";
import { focusOn, refund, spend } from "../lib/focus";
import { RESEARCH } from "../lib/research-config";
import { assertResearchPurpose } from "../lib/session-purpose";
import { findSocialCandidates, type Network } from "../lib/socials";
import { tenantTool } from "../lib/tenant";

const NETWORKS: readonly Network[] = ["x", "github"];

const tool = defineTool({
	description:
		"Search the web for a contact's X and GitHub profiles. Returns CANDIDATES ONLY — pass them to set_contact_socials, which re-checks each one against the account itself before writing. Never write these URLs any other way.",
	inputSchema: z.object({
		contactId: z.string(),
	}),
	async execute({ contactId }, ctx) {
		assertResearchPurpose(ctx);
		focusOn({ contactId });

		if (!(await enabled("PERPLEXITY_API_KEY"))) {
			return { searched: false as const, ...unavailable("PERPLEXITY_API_KEY") };
		}

		const person = await personForVerification(contactId);
		if (!person) {
			return { searched: false as const, reason: NOT_LIVE.contact };
		}

		const cost = RESEARCH.cost.socialSearch;
		const charge = spend(cost * NETWORKS.length);
		if (!charge.ok) return { searched: false as const, reason: charge.reason };

		const searches = await Promise.all(
			NETWORKS.map(async (network) => ({
				network,
				search: await findSocialCandidates(person, network),
			})),
		);

		const failed = searches.flatMap(({ network, search }) =>
			search.ok ? [] : [{ network, reason: search.reason }],
		);
		refund(cost * failed.length);

		if (failed.length === searches.length) {
			return {
				searched: false as const,
				retryable: true as const,
				reason:
					`The web search did not answer (${failed.map((entry) => `${entry.network}: ${entry.reason}`).join("; ")}). ` +
					"Nothing was charged and the contact is not marked as checked, so a later run searches again.",
			};
		}

		await stampSocialsChecked(contactId);

		const found = (network: Network) =>
			searches.flatMap((entry) =>
				entry.network === network && entry.search.ok
					? entry.search.candidates.map((candidate) => candidate.url)
					: [],
			);

		return {
			searched: true as const,
			searchedFor: person.fullName,
			candidates: { x: found("x"), github: found("github") },
			citations: searches.flatMap(({ search }) =>
				search.ok ? search.citations : [],
			),
			unanswered: failed.map((entry) => entry.network),
			note: "Unverified. set_contact_socials will reject any of these it cannot corroborate, and that is a normal outcome.",
		};
	},
});

export default tenantTool(tool);
