import { defineDynamic, defineInstructions } from "eve/instructions";
import { z } from "zod";
import { db } from "@crm/db";
import { readMonthlyUsage, roomFor } from "@crm/db/plan-usage";
import { builderFeedbackMarkdown } from "../lib/builder-feedback";
import { focusOn, setBudget } from "../lib/focus";
import { planLimits } from "../lib/plan-limits";
import { sessionPreamble } from "../lib/preamble";
import { RESEARCH_INSTRUCTIONS } from "../lib/research-instructions";
import { attribute, purposeOf } from "../lib/session-purpose";
import { withTenant } from "../lib/tenant";

const attributeText = z.string().trim().min(1).nullable().catch(null);

const attributeNumber = z
	.union([z.string(), z.number()])
	.transform(Number)
	.refine(Number.isFinite)
	.nullable()
	.catch(null);

export default defineDynamic({
	events: {
		"session.started": (_event, ctx) =>
			withTenant(ctx, () => sessionInstructions(ctx)),
		"turn.started": (_event, ctx) =>
			withTenant(ctx, () =>
				purposeOf(ctx) === "builder" ? builderInstructions(ctx) : null,
			),
	},
});

async function sessionInstructions(
	ctx: Parameters<typeof purposeOf>[0] & { session: { id: string } },
) {
	const purpose = purposeOf(ctx);
	const stop = await limitReached(purpose === "builder" ? "builder" : "chat");
	if (stop) return stop;

	if (purpose === "builder") {
		return builderInstructions(ctx);
	}

	if (purpose === "team-agent") {
		return defineInstructions({
			markdown: `This is one background run of a deployed team agent. Call agent_runner exactly once and pass the run id from your user message. Do not call research tools or perform work yourself. Relay the specialist's structured factual completion summary. Never claim an external action that the specialist did not log.`,
		});
	}

	const attributes = ctx.session.auth.current?.attributes ?? {};
	const budget = attributeNumber.parse(attributes.budget);
	const kind = attributeText.parse(attributes.taskKind);

	if (budget) setBudget(budget);

	const fieldKeys = attributeText.parse(attributes.fieldKeys);

	const { markdown, focus } = await sessionPreamble(
		{
			contactId: attributeText.parse(attributes.contactId),
			companyId: attributeText.parse(attributes.companyId),
			dealId: attributeText.parse(attributes.dealId),
		},
		{
			dispatched: Boolean(kind),
			kind,
			reason: attributeText.parse(attributes.reason),
			budget,
			fieldKeys: fieldKeys ? fieldKeys.split(",") : null,
		},
	);

	focusOn({ ...focus, sessionId: ctx.session.id, taskKind: kind });

	return defineInstructions({
		markdown: `${RESEARCH_INSTRUCTIONS}\n\n${markdown}`,
	});
}

export const LIMIT_REACHED_INSTRUCTION =
	"The monthly limit of this workspace's plan for this kind of conversation is reached. Answer with one sentence: the limit is reached, the conversation continues next month, and an upgrade of the plan continues it now. Call no tool and do nothing else.";

async function limitReached(
	counter: "chat" | "builder",
): Promise<{ markdown: string } | null> {
	try {
		const limits = await planLimits();
		const limit =
			limits[counter === "chat" ? "chatPerMonth" : "builderPerMonth"];
		if (limit === null) return null;

		const room = roomFor(counter, await readMonthlyUsage(db), limits);
		return room !== null && room <= 0
			? defineInstructions({ markdown: LIMIT_REACHED_INSTRUCTION })
			: null;
	} catch {
		return null;
	}
}

async function builderInstructions(ctx: Parameters<typeof purposeOf>[0]) {
	const task = builderTaskMarkdown(
		attribute(ctx, "commandType"),
		attribute(ctx, "needsTitle") === "true",
	);
	const feedback = await builderFeedbackMarkdown(attribute(ctx, "userId"));

	return defineInstructions({
		markdown: feedback ? `${task}\n\n${feedback}` : task,
	});
}

export function builderTaskMarkdown(
	commandType: string | null,
	needsTitle = false,
): string {
	const task =
		commandType === "CREATE_AGENT"
			? `This private CRM chat turn is authorized to create or revise an agent. Call agent_builder exactly once and call it immediately; do not ask the user a clarification yourself. Pass the complete request, the conversation's relevant decisions, every tagged resource, and your understanding of any attachment. Do not call research tools or mutate CRM records yourself. The specialist inspects authoritative context, asks any essential clarification directly through ask_question, and returns only when the draft is ready. Never retry agent_builder in the same turn. If the specialist fails, explain that the build could not finish and ask the user to try again instead of delegating again. If the specialist returns draft_ready, relay its concise summary and explain that the draft is ready for human review and is not deployed yet.`
			: `This is a private CRM assistant chat. Answer the user's question directly. Use tagged records as scope and use available read-only CRM and research tools when evidence is needed. Use list_deals for pipeline-wide, open-deal, or inactivity questions and follow its pagination until the requested scope is complete. Use list_win_back_candidates when asked who to follow up with, which contacts or customers went quiet, or who is waiting on a reply; repeat its stated facts and never add a judgement about how valuable a person is. Use read_playbook to know how the rep usually offers, accepts and declines before judging a conversation or drafting a reply. Use read_contact_memory before read_crm_history when asked what was discussed with someone or whether we did business with them; it is the bounded memory and costs nothing. The chat renders list_deals output as a structured deal list. Do not restate or enumerate individual deal rows in prose, bullets, or tables; the structured list is the sole row-level presentation. Give only a concise synthesis, caveats, and useful next actions after the tool results. If one materially necessary decision is missing, call ask_question with one focused follow-up instead of guessing; do not interrupt for optional detail. Do not call agent_builder, create an agent draft, or mutate CRM records on this turn. Agent creation begins only from an explicit request to create or build one. Be concise, distinguish CRM evidence from inference, and say when the CRM does not contain the answer.`;

	return needsTitle
		? `Before any other work, call set_chat_title once. Summarize the user's first message as a polished title of three to seven words in sentence case. Capture the intent, remove slash-command syntax and filler, and do not use quotation marks or ending punctuation.\n\n${task}`
		: task;
}
