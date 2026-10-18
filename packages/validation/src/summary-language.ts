import type { Locale } from "@crm/db/locale";

export const SUMMARY_LANGUAGE_DETECTION = {
	sentence: { minWords: 4, minHits: 2, leadFactor: 2, minHanChars: 4 },
	lean: { minWords: 1, minHits: 1, leadFactor: 1, minHanChars: 2 },
	hanShare: 0.5,
} as const;

type Strictness = (typeof SUMMARY_LANGUAGE_DETECTION)["sentence" | "lean"];

type LatinLocale = Exclude<Locale, "zh-Hans">;

const STOPWORDS = {
	de: new Set([
		"der",
		"die",
		"das",
		"und",
		"ist",
		"nicht",
		"mit",
		"sich",
		"auf",
		"dem",
		"den",
		"ein",
		"eine",
		"einen",
		"einem",
		"einer",
		"zu",
		"von",
		"für",
		"wird",
		"werden",
		"wurde",
		"hat",
		"haben",
		"sind",
		"noch",
		"auch",
		"nach",
		"bei",
		"über",
		"oder",
		"aber",
		"wie",
		"dass",
		"kein",
		"keine",
		"sie",
		"er",
		"wir",
		"ihr",
		"ihre",
		"ihm",
		"sein",
		"seine",
		"beim",
		"zum",
		"zur",
		"vom",
		"bis",
		"schon",
		"mehr",
		"weil",
		"wenn",
		"um",
		"durch",
		"ohne",
		"unter",
		"bitte",
		"möchte",
		"soll",
		"kann",
		"muss",
		"damit",
		"dann",
		"aus",
		"jetzt",
		"hier",
		"neue",
		"neuen",
		"wieder",
	]),
	en: new Set([
		"the",
		"and",
		"is",
		"are",
		"was",
		"were",
		"with",
		"for",
		"that",
		"this",
		"to",
		"of",
		"has",
		"have",
		"had",
		"not",
		"they",
		"their",
		"them",
		"he",
		"she",
		"his",
		"her",
		"we",
		"our",
		"it",
		"its",
		"be",
		"been",
		"would",
		"could",
		"should",
		"about",
		"from",
		"which",
		"who",
		"by",
		"on",
		"at",
		"or",
		"but",
		"asked",
		"wants",
		"new",
		"again",
		"after",
		"there",
	]),
	es: new Set([
		"el",
		"los",
		"las",
		"del",
		"y",
		"con",
		"una",
		"su",
		"sus",
		"está",
		"están",
		"pero",
		"más",
		"al",
		"lo",
		"ha",
		"han",
		"también",
		"pidió",
		"nuevo",
		"nueva",
	]),
	fr: new Set([
		"le",
		"les",
		"des",
		"et",
		"est",
		"une",
		"du",
		"au",
		"aux",
		"pour",
		"avec",
		"dans",
		"sur",
		"pas",
		"qui",
		"il",
		"elle",
		"ils",
		"nous",
		"vous",
		"ce",
		"cette",
		"sont",
		"ont",
		"été",
		"mais",
		"ou",
		"plus",
		"leur",
		"par",
		"nouvelle",
		"nouveau",
	]),
	"pt-BR": new Set([
		"o",
		"os",
		"uma",
		"não",
		"com",
		"dos",
		"na",
		"ao",
		"é",
		"são",
		"foi",
		"pelo",
		"pela",
		"seu",
		"sua",
		"mas",
		"também",
		"você",
		"isso",
		"ele",
		"ela",
		"eles",
		"em",
		"pediu",
		"novo",
		"nova",
	]),
	tr: new Set([
		"ve",
		"bir",
		"bu",
		"için",
		"ile",
		"olarak",
		"çok",
		"daha",
		"ama",
		"gibi",
		"olan",
		"var",
		"yok",
		"mı",
		"şu",
		"ise",
		"sonra",
		"kadar",
		"ancak",
		"değil",
		"veya",
		"yeni",
		"tekrar",
	]),
} satisfies Record<LatinLocale, ReadonlySet<string>>;

const LATIN_LOCALES = Object.keys(STOPWORDS) as LatinLocale[];

const WORD = /\p{L}+(?:['’]\p{L}+)?/gu;

const HAN = /\p{Script=Han}/gu;

const LETTER = /\p{L}/gu;

const SENTENCE_END = /[.!?;:\n。！？；]+/u;

export type DetectedSummaryLanguage =
	| { kind: "single"; language: Locale }
	| { kind: "mixed"; languages: Locale[] }
	| { kind: "unknown" };

function countOf(text: string, pattern: RegExp): number {
	return text.match(pattern)?.length ?? 0;
}

function judge(text: string, strictness: Strictness): Locale | null {
	const han = countOf(text, HAN);
	const letters = countOf(text, LETTER);
	if (
		han >= strictness.minHanChars &&
		han / Math.max(letters, 1) >= SUMMARY_LANGUAGE_DETECTION.hanShare
	) {
		return "zh-Hans";
	}

	const words = text.toLowerCase().match(WORD) ?? [];
	if (words.length < strictness.minWords) return null;

	const ranked = LATIN_LOCALES.map((locale) => ({
		locale,
		hits: words.filter((word) => STOPWORDS[locale].has(word)).length,
	})).sort((a, b) => b.hits - a.hits);
	const [first, second] = ranked;
	const runnerUp = second?.hits ?? 0;
	if (!first || first.hits < strictness.minHits) return null;
	if (first.hits <= runnerUp) return null;
	if (first.hits < runnerUp * strictness.leadFactor) return null;

	return first.locale;
}

export function detectSummaryLanguage(text: string): DetectedSummaryLanguage {
	const found = new Set<Locale>();
	const leaning = new Set<Locale>();
	for (const sentence of text.split(SENTENCE_END)) {
		const language = judge(sentence, SUMMARY_LANGUAGE_DETECTION.sentence);
		if (language) {
			found.add(language);
			continue;
		}
		const lean = judge(sentence, SUMMARY_LANGUAGE_DETECTION.lean);
		if (lean) leaning.add(lean);
	}

	if (found.size === 0) {
		const whole = judge(text, SUMMARY_LANGUAGE_DETECTION.sentence);
		if (!whole) return { kind: "unknown" };
		found.add(whole);
	}

	const all = new Set([...found, ...leaning]);
	if (all.size > 1) return { kind: "mixed", languages: [...all].sort() };

	const [only] = all;
	return only ? { kind: "single", language: only } : { kind: "unknown" };
}
