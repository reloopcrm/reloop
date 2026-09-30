import { describe, expect, it } from "bun:test";
import { DRAFT } from "../agent/lib/draft-config";
import {
	type DraftMessage,
	type DraftPromptInput,
	type DraftThread,
	draftPrompt,
	type SentSample,
	voiceSection,
} from "../agent/lib/draft-prompt";

function message(
	direction: "INBOUND" | "OUTBOUND",
	day: string,
	body: string,
	subject: string | null = "Workshop im Oktober",
): DraftMessage {
	return {
		direction,
		fromName: direction === "OUTBOUND" ? "Tom Muster" : "Maria Beispiel",
		fromEmail:
			direction === "OUTBOUND" ? "tom@example.com" : "maria@example.org",
		subject,
		sentAt: new Date(`2026-${day}T09:00:00.000Z`),
		body,
		snippet: null,
	};
}

const workshop: DraftThread = {
	subject: "Workshop im Oktober",
	messages: [
		message(
			"OUTBOUND",
			"08-01",
			"Hallo Maria,\n\nhast du Lust auf den Workshop im Oktober?\n\nViele Grüße\nTom",
		),
		message(
			"INBOUND",
			"08-03",
			"Hallo Tom,\n\ngerne, aber können wir den Raum im Erdgeschoss nehmen? Die Treppe ist für zwei Kolleginnen schwierig.\n\nLiebe Grüße\nMaria\n\nAm 01.08.2026 um 10:00 schrieb Tom Muster:\n> hast du Lust auf den Workshop im Oktober?",
		),
	],
};

const toMaria: SentSample[] = [
	{
		subject: "Workshop im Oktober",
		body: "Hallo Maria,\n\nhast du Lust auf den Workshop im Oktober? Wir sind etwa zwölf Leute.\n\nViele Grüße\nTom\n--\nTom Muster\nwww.example.com",
	},
	{
		subject: "Fotos vom Sommerfest",
		body: "Hi Maria,\n\nanbei die Fotos vom Sommerfest, sag mir einfach, welche du für den Newsletter willst.\n\nViele Grüße\nTom",
	},
];

const toOthers: SentSample[] = [
	{
		subject: "Angebot Beratung",
		body: "Sehr geehrter Herr Probe,\n\nanbei erhalten Sie unser Angebot für die Beratung. Melden Sie sich gern bei Fragen.\n\nBeste Grüße\nTom Muster",
	},
];

function input(overrides: Partial<DraftPromptInput> = {}): DraftPromptInput {
	return {
		today: new Date("2026-08-05T09:00:00.000Z"),
		facts: "Recipient: Maria Beispiel",
		threads: [workshop],
		voice: { toContact: toMaria, general: toOthers },
		previous: null,
		openings: "",
		style: "",
		playbook: "",
		business: [],
		...overrides,
	};
}

describe("the draft prompt is built on this conversation", () => {
	it("carries the latest message and marks it as the last one", () => {
		const { prompt } = draftPrompt(input());

		expect(prompt).toContain("Raum im Erdgeschoss");
		expect(prompt).toContain(
			"LAST MESSAGE [2026-08-03] CONTACT (Maria Beispiel)",
		);
		expect(prompt).toContain("CURRENT THREAD, continue this one");
	});

	it("drops the quoted history under the latest message", () => {
		const { prompt } = draftPrompt(input());

		expect(prompt).not.toContain("> hast du Lust");
		expect(prompt).not.toContain("schrieb Tom Muster");
	});

	it("skips an auto reply when it looks for the last real message", () => {
		const away = message(
			"INBOUND",
			"08-04",
			"Ich bin zurzeit im Urlaub und ab dem 20.08. wieder erreichbar.",
			"Automatische Antwort: Workshop im Oktober",
		);
		const { prompt } = draftPrompt(
			input({
				threads: [{ ...workshop, messages: [...workshop.messages, away] }],
			}),
		);

		expect(prompt).not.toContain("im Urlaub");
		expect(prompt).toContain("LAST MESSAGE [2026-08-03]");
	});

	it("keeps a reply written under a quote", () => {
		const reply = message(
			"OUTBOUND",
			"08-04",
			"> passt Dienstag?\n\nJa, 10 Uhr",
		);
		const { prompt } = draftPrompt(
			input({
				threads: [{ ...workshop, messages: [...workshop.messages, reply] }],
			}),
		);

		expect(prompt).toContain("LAST MESSAGE [2026-08-04] SENDER:\nJa, 10 Uhr");
		expect(prompt).not.toContain("> passt Dienstag?");
	});

	it("names today and the age of the last message", () => {
		const { system } = draftPrompt(input());

		expect(system).toContain(
			"Today is 2026-08-05. The last message is 2 days old.",
		);
		expect(system).not.toContain("Reopen the conversation");
	});

	it("reopens an old conversation instead of answering it as fresh", () => {
		const { system } = draftPrompt(
			input({ today: new Date("2026-11-01T09:00:00.000Z") }),
		);

		expect(system).toContain("The last message is 90 days old.");
		expect(system).toContain("Reopen the conversation naturally");
	});

	it("forbids promising what the sender did not commit to", () => {
		const { system } = draftPrompt(input());

		expect(system).toContain("Never promise, confirm or change anything");
		expect(system).toContain("IBAN");
	});

	it("puts the current thread before an older one", () => {
		const older: DraftThread = {
			subject: "Sommerfest",
			messages: [
				message("INBOUND", "06-10", "Danke für die Einladung zum Sommerfest!"),
			],
		};
		const { prompt } = draftPrompt(input({ threads: [workshop, older] }));

		expect(prompt.indexOf("Erdgeschoss")).toBeLessThan(
			prompt.indexOf("Sommerfest!"),
		);
		expect(prompt).toContain("EARLIER THREAD, background only");
	});
});

describe("the draft prompt carries the sender's own voice", () => {
	it("includes his own mails and never another sender's text", () => {
		const { system } = draftPrompt(input());

		expect(system).toContain("anbei die Fotos vom Sommerfest");
		expect(system).toContain("Wir sind etwa zwölf Leute");
		expect(system).not.toContain("Die Treppe ist für zwei Kolleginnen");
		expect(system).not.toContain("Liebe Grüße");
	});

	it("strips his signature block out of an example", () => {
		const { system } = draftPrompt(input());

		expect(system).not.toContain("www.example.com");
		expect(system).toContain('"Viele Grüße / Tom"');
	});

	it("uses du and German when he writes that way to this contact", () => {
		const { system } = draftPrompt(input());

		expect(system).toContain("He writes to this contact in German.");
		expect(system).toContain('Use "du" in this email.');
		expect(system).toContain(
			"Write in German, the language of the last message.",
		);
	});

	it("uses Sie when his mails to this contact say Sie", () => {
		const formal: SentSample[] = [
			{
				subject: "Termin",
				body: "Sehr geehrte Frau Beispiel,\n\nkönnen Sie mir Ihren Terminvorschlag für den Workshop schicken? Ich richte mich gern nach Ihnen.\n\nBeste Grüße\nTom Muster",
			},
		];
		const section = voiceSection({ toContact: formal, general: toMaria }, []);

		expect(section).toContain('Use "Sie" in this email.');
		expect(section).not.toContain('Use "du"');
	});

	it("keeps a formal greeting as his greeting, not as an opening to avoid", () => {
		const formal: SentSample[] = [
			{
				subject: "Angebot",
				body: "Sehr geehrter Herr Probe,\n\nanbei erhalten Sie das Angebot für die Beratung.\n\nMit freundlichen Grüßen\nTom Muster",
			},
		];
		const { system } = draftPrompt(
			input({ voice: { toContact: formal, general: [] } }),
		);

		expect(system).toContain(
			'His greetings to this contact: "Sehr geehrter Herr Probe,"',
		);
		expect(system).not.toContain("- Sehr geehrter Herr Probe,");
		expect(system).toContain(
			"- anbei erhalten Sie das Angebot für die Beratung.",
		);
	});

	it("follows English samples and names no du or Sie", () => {
		const english: SentSample[] = [
			{
				subject: "Workshop",
				body: "Hi Maria,\n\nthanks for the note, we can have the room on the ground floor. Would you like coffee as well?\n\nCheers\nTom",
			},
		];
		const section = voiceSection({ toContact: english, general: [] }, []);

		expect(section).toContain("He writes to this contact in English.");
		expect(section).not.toContain('"du"');
		expect(section).not.toContain('"Sie"');
	});

	it("drops a sent mail that still carries someone else's quoted header", () => {
		const forwarded: SentSample = {
			subject: "WG: Raum",
			body: "Danke dir, passt so. Viele Grüße Tom -----Original Message----- From: Maria Beispiel Sent: Monday To: Tom Hallo Tom, der Raum im Erdgeschoss ist frei.",
		};
		const section = voiceSection(
			{ toContact: [forwarded, ...toMaria], general: [] },
			[],
		);

		expect(section).not.toContain("der Raum im Erdgeschoss ist frei");
		expect(section).not.toContain("Original Message");
		expect(section).toContain("anbei die Fotos vom Sommerfest");
	});

	it("takes nothing personal from his mails to other customers", () => {
		const others: SentSample[] = [
			{
				subject: "Angebot",
				body: "Sehr geehrter Herr Probe,\n\ndas Angebot liegt bei 4.500 Euro und gilt bis Freitag.\n\nMit freundlichen Grüßen\nTom Muster",
			},
			{
				subject: "Rechnung",
				body: "Hallo Frau Kranz,\n\ndu bekommst die Rechnung über 1.200 Euro morgen.\n\nViele Grüße\nTom",
			},
		];
		const { system } = draftPrompt(
			input({ voice: { toContact: [], general: others } }),
		);

		expect(system).not.toContain("Probe");
		expect(system).not.toContain("Kranz");
		expect(system).not.toContain("4.500");
		expect(system).not.toContain("1.200");
		expect(system).not.toContain("Angebot liegt");
		expect(system).toContain("He writes to other people in German.");
		expect(system).toContain("He never wrote to this contact before.");
		expect(system).toContain('"Mit freundlichen Grüßen / Tom Muster"');
	});

	it("takes du or Sie from how the contact writes when he never wrote to her", () => {
		const asked = message(
			"INBOUND",
			"08-04",
			"Hallo Tom,\n\nkannst du mir den Raum bestätigen? Dein Plan passt mir.\n\nLiebe Grüße\nMaria",
		);
		const { system } = draftPrompt(
			input({
				threads: [{ subject: "Raum", messages: [asked] }],
				voice: { toContact: [], general: toOthers },
			}),
		);

		expect(system).toContain(
			'This contact says "du" to him. Use "du" in this email.',
		);
		expect(system).not.toContain('Use "Sie"');
	});

	it("says nothing about his voice when he never sent a mail", () => {
		expect(voiceSection({ toContact: [], general: [] }, [])).toBe("");
	});

	it("asks for a different opening than the one this contact already read", () => {
		const { system } = draftPrompt(
			input({
				previous: {
					subject: "Workshop im Oktober",
					body: "Hallo Maria,\n\nich wollte wegen dem Workshop nachhaken.\n\nViele Grüße\nTom",
				},
			}),
		);

		expect(system).toContain("Open and close differently this time");
		expect(system).toContain("- ich wollte wegen dem Workshop nachhaken.");
	});
});

describe("the draft prompt carries no trade template", () => {
	it("names no pallets and no pickup for a workshop thread", () => {
		const { system, prompt } = draftPrompt(input());
		const all = `${system}\n${prompt}`;

		expect(all).not.toMatch(/palette|pallet|abholung|zur abholung verfügbar/i);
		expect(all).not.toContain("SELLER");
		expect(all).not.toContain("BUYER");
		expect(all).not.toContain("Mustermann");
	});
});

describe("the draft prompt stays inside its bounds", () => {
	const long = "Das ist ein langer Satz über den Workshop im Oktober. ".repeat(
		60,
	);

	it("keeps the voice section under its cap", () => {
		const many: SentSample[] = Array.from({ length: 12 }, (_, index) => ({
			subject: `Mail ${index}`,
			body: `Hallo Maria,\n\n${long}\n\nViele Grüße\nTom`,
		}));
		const section = voiceSection({ toContact: many, general: many }, []);
		const examples = section.split("\n").filter((line) => /^#\d+$/.test(line));

		expect(examples.length).toBeGreaterThan(0);
		expect(examples.length).toBeLessThanOrEqual(DRAFT.voice.examples);
		expect(section.length).toBeLessThan(DRAFT.voice.totalMaxChars + 1_000);
	});

	it("keeps the greeting and sign off lists short", () => {
		const many: SentSample[] = Array.from({ length: 10 }, (_, index) => ({
			subject: `Mail ${index}`,
			body: `Hallo Maria ${"x".repeat(index * 12)},\n\nkurze Frage zum Workshop Nummer ${index}.\n\nViele Grüße ${index}x\nTom`,
		}));
		const section = voiceSection({ toContact: many, general: [] }, []);
		const line =
			section
				.split("\n")
				.find((part) => part.startsWith("His greetings to this contact:")) ??
			"";
		const items = line.match(/"[^"]*"/g) ?? [];

		expect(items.length).toBeGreaterThan(0);
		expect(items.length).toBeLessThanOrEqual(DRAFT.voice.listItems);
		for (const item of items) {
			expect(item.length - 2).toBeLessThanOrEqual(DRAFT.voice.listItemMaxChars);
		}
	});

	it("keeps the conversation under its cap and keeps the last message", () => {
		const busy: DraftThread[] = Array.from(
			{ length: DRAFT.threads },
			(_, t) => ({
				subject: `Thread ${t}`,
				messages: Array.from({ length: 20 }, (_, index) =>
					message(
						index % 2 ? "INBOUND" : "OUTBOUND",
						`07-${String(index + 1).padStart(2, "0")}`,
						`${t}-${index} ${long}`,
					),
				),
			}),
		);
		const { prompt } = draftPrompt(input({ threads: busy }));
		const conversation = prompt.slice(prompt.indexOf("<untrusted-text>"));

		expect(conversation.length).toBeLessThan(DRAFT.conversationMaxChars + 200);
		expect(conversation).toContain("LAST MESSAGE [2026-07-20]");
	});
});
