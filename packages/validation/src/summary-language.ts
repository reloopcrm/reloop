import type { Locale } from "@crm/db/locale";

export const SUMMARY_LANGUAGE_DETECTION = {
	minWords: 4,
	minHits: 2,
	leadFactor: 2,
	hanShare: 0.5,
	minHanChars: 4,
} as const;

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

function judge(text: string, minWords: number): Locale | null {
	const han = countOf(text, HAN);
	const letters = countOf(text, LETTER);
	if (
		han >= SUMMARY_LANGUAGE_DETECTION.minHanChars &&
		han / Math.max(letters, 1) >= SUMMARY_LANGUAGE_DETECTION.hanShare
	) {
		return "zh-Hans";
	}

	const words = text.toLowerCase().match(WORD) ?? [];
	if (words.length < minWords) return null;

	const ranked = LATIN_LOCALES.map((locale) => ({
		locale,
		hits: words.filter((word) => STOPWORDS[locale].has(word)).length,
	})).sort((a, b) => b.hits - a.hits);
	const [first, second] = ranked;
	if (!first || first.hits < SUMMARY_LANGUAGE_DETECTION.minHits) return null;
	if (
		first.hits <
		(second?.hits ?? 0) * SUMMARY_LANGUAGE_DETECTION.leadFactor
	) {
		return null;
	}

	return first.locale;
}

export function detectSummaryLanguage(text: string): DetectedSummaryLanguage {
	const found = new Set<Locale>();
	for (const sentence of text.split(SENTENCE_END)) {
		const language = judge(sentence, SUMMARY_LANGUAGE_DETECTION.minWords);
		if (language) found.add(language);
	}

	if (found.size > 1) return { kind: "mixed", languages: [...found].sort() };

	const [only] = found;
	if (only) return { kind: "single", language: only };

	const whole = judge(text, SUMMARY_LANGUAGE_DETECTION.minWords);
	return whole ? { kind: "single", language: whole } : { kind: "unknown" };
}
