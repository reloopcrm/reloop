import { db } from "@crm/db";
import { parsePersonStory } from "@crm/validation/person-story";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { COPY } from "./copy";
import { askJson, businessPrompt } from "./insight";
import { say, summaryLanguage, summaryWrittenIn } from "./language";
import { directModel } from "./model";
import { STORY } from "./story-config";
import {
	numberMessages,
	type StoryDeal,
	storyAnswer,
	storyAnswerShape,
	storyFromAnswer,
	storyPrompt,
} from "./story-prompt";

async function storyInput(contactId: string) {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			email: true,
			title: true,
			companyId: true,
			company: { select: { name: true } },
			memory: { select: { summary: true } },
			story: { select: { story: true } },
			emailThreads: {
				where: { OR: [{ insight: null }, { insight: { relevant: true } }] },
				orderBy: { lastMessageAt: "desc" },
				take: STORY.threads,
				select: {
					messages: {
						orderBy: { sentAt: "asc" },
						select: {
							id: true,
							direction: true,
							fromName: true,
							fromEmail: true,
							subject: true,
							sentAt: true,
							body: true,
							snippet: true,
						},
					},
				},
			},
		},
	});
	if (!contact) return null;

	const deals = await db.deal.findMany({
		where: {
			archivedAt: null,
			OR: [
				{ contacts: { some: { contactId } } },
				...(contact.companyId ? [{ companyId: contact.companyId }] : []),
			],
		},
		orderBy: { createdAt: "desc" },
		take: STORY.deals,
		select: {
			name: true,
			stage: true,
			amount: true,
			currency: true,
			closedAt: true,
			createdAt: true,
		},
	});

	return { contact, deals };
}

export async function runPersonStory(
	contactId: string,
	reread: boolean,
	buildModel: typeof directModel = directModel,
): Promise<string> {
	const input = await storyInput(contactId);
	if (!input) return say(COPY.stories.contactGone);

	const { contact } = input;
	const messages = contact.emailThreads.flatMap((thread) => thread.messages);
	const numbered = numberMessages(messages, contact.email);
	if (numbered.length === 0) return say(COPY.stories.noConversation);

	const newest = await db.emailThread.aggregate({
		where: { contactId },
		_max: { lastMessageAt: true },
	});

	const previous =
		reread && contact.story ? parsePersonStory(contact.story.story) : null;
	const deals: StoryDeal[] = input.deals.map((deal) => ({
		...deal,
		amount: deal.amount?.toString() ?? null,
	}));

	const [rules, model] = await Promise.all([
		readWinBackRules(db),
		buildModel("reading", "person-story"),
	]);
	const wanted = summaryLanguage();
	const { system, prompt } = storyPrompt(
		{
			today: new Date(),
			writtenIn: summaryWrittenIn(wanted),
			person: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
			company: contact.company?.name ?? null,
			business: await businessPrompt(rules),
			memory: contact.memory?.summary ?? null,
			deals,
			messages,
			previous: previous?.ok ? previous.story : null,
		},
		numbered,
	);

	const answer = await askJson(
		model,
		storyAnswer,
		system,
		prompt,
		storyAnswerShape,
		{
			maxOutputTokens: STORY.maxOutputTokens,
			providerOptions: STORY.providerOptions,
		},
	);
	const story = storyFromAnswer(answer, numbered);
	const fields = {
		story,
		language: wanted,
		modelId: model.modelId,
		basedOnUntil: newest._max.lastMessageAt,
		basedOnCount: numbered.length,
	};

	await db.contactStory.upsert({
		where: { contactId },
		create: { contactId, ...fields },
		update: fields,
	});

	return say(reread ? COPY.stories.reread : COPY.stories.written);
}
