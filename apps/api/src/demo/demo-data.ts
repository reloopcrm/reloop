import {
	ActivityType,
	type Db,
	DealStage,
	EmailDirection,
	EnrichmentStatus,
	Prisma,
	RecordSource,
} from "@crm/db";
import {
	type ContactPotential,
	type ContactStanding,
	standingOf,
} from "@crm/db/contact-standing";
import type { QuantityRule, ThreadSignal } from "@crm/db/contact-worth";
import { convertToBase } from "@crm/db/fx";
import { DEFAULT_LOCALE, type Locale } from "@crm/db/locale";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import { readReportingCurrency } from "@crm/db/settings";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { type DemoCopy, demoCopy } from "./demo-copy";

const DAY_MS = 86_400_000;

export const DEMO = {
	prefix: SAMPLE_DATA.prefix,
	currency: "EUR",
	modelId: "demo-data",
	snippetChars: 120,
	message: { gapDays: 1.4, firstHour: 9, hourStep: 3 },
	showcase: { contact: "lindenhof-1", taskDueInDays: 3 },
} as const;

type ThreadKind =
	| "inquiry"
	| "deal"
	| "followup"
	| "paperwork"
	| "delivery"
	| "invoice"
	| "claim"
	| "meeting";

type Person = { first: string; last: string; title: string };

type Company = {
	key: string;
	name: string;
	domain: string;
	industry: string;
	city: string;
	country: string;
	countryCode: string;
	people: Person[];
};

type ThreadSpec = {
	kind: ThreadKind;
	product: string;
	qty: number | null;
	ref: string;
	endDaysAgo: number;
	take: number;
};

type Memory = {
	summary: string;
	didBusiness: number;
	openInquiries: number;
	maxPallets: number | null;
	products: string[];
	lastOutcome: string;
};

type Candidate = { contact: string; threads: ThreadSpec[]; memory: Memory };

type DealSpec = {
	key: string;
	name: string;
	company: string;
	contact: string;
	stage: DealStage;
	amount: number;
	createdDaysAgo: number;
	closedDaysAgo: number | null;
	closesInDays: number | null;
	closedReason: string | null;
};

const COMPANIES: Company[] = [
	{
		key: "lindenhof",
		name: "Lindenhof Wohnen GmbH",
		domain: "lindenhof-wohnen.example",
		industry: "Furniture retail",
		city: "Hamburg",
		country: "Germany",
		countryCode: "DE",
		people: [
			{ first: "Jana", last: "Reimers", title: "Head of Purchasing" },
			{ first: "Moritz", last: "Ahlers", title: "Office Manager" },
			{ first: "Clara", last: "Wendt", title: "Managing Director" },
		],
	},
	{
		key: "brakelsveld",
		name: "Brakelsveld Groothandel B.V.",
		domain: "brakelsveld.example",
		industry: "Wholesale",
		city: "Rotterdam",
		country: "Netherlands",
		countryCode: "NL",
		people: [
			{ first: "Roos", last: "Verhagen", title: "Purchasing Manager" },
			{ first: "Bram", last: "Oudejans", title: "Owner" },
			{ first: "Lotte", last: "Kampen", title: "Project Manager" },
		],
	},
	{
		key: "warnow",
		name: "Warnow Maschinenbau GmbH",
		domain: "warnow-maschinenbau.example",
		industry: "Mechanical engineering",
		city: "Rostock",
		country: "Germany",
		countryCode: "DE",
		people: [
			{ first: "Silke", last: "Brandes", title: "Operations Manager" },
			{ first: "Jannik", last: "Petersen", title: "Team Lead" },
			{ first: "Doreen", last: "Mahnke", title: "Finance Lead" },
		],
	},
	{
		key: "vautrin",
		name: "Atelier Vautrin SAS",
		domain: "atelier-vautrin.example",
		industry: "Design agency",
		city: "Lyon",
		country: "France",
		countryCode: "FR",
		people: [
			{ first: "Claire", last: "Dumontel", title: "Purchasing Director" },
			{ first: "Hugo", last: "Ravanel", title: "Site Manager" },
			{ first: "Lea", last: "Fournel", title: "Project Coordinator" },
		],
	},
	{
		key: "pizolt",
		name: "Pizolt Software AG",
		domain: "pizolt-software.example",
		industry: "Software house",
		city: "Chur",
		country: "Switzerland",
		countryCode: "CH",
		people: [
			{ first: "Flurin", last: "Caduff", title: "Technical Manager" },
			{ first: "Seraina", last: "Derungs", title: "Purchasing" },
			{ first: "Andri", last: "Vieli", title: "CEO" },
		],
	},
	{
		key: "verdalba",
		name: "Verdalba Hotels Srl",
		domain: "verdalba-hotels.example",
		industry: "Hospitality",
		city: "Genoa",
		country: "Italy",
		countryCode: "IT",
		people: [
			{ first: "Chiara", last: "Benvenuti", title: "Purchasing Director" },
			{ first: "Matteo", last: "Scorza", title: "Customer Service Lead" },
		],
	},
	{
		key: "fjellbru",
		name: "Fjellbru Bygg AS",
		domain: "fjellbru-bygg.example",
		industry: "Construction",
		city: "Bergen",
		country: "Norway",
		countryCode: "NO",
		people: [
			{ first: "Ingrid", last: "Vollan", title: "Procurement Lead" },
			{ first: "Torstein", last: "Myre", title: "Operations" },
		],
	},
	{
		key: "kvarnby",
		name: "Kvarnby Kontor AB",
		domain: "kvarnby-kontor.example",
		industry: "Office supplies",
		city: "Gothenburg",
		country: "Sweden",
		countryCode: "SE",
		people: [
			{ first: "Elin", last: "Sjoedal", title: "Category Buyer" },
			{ first: "Viktor", last: "Hallberg", title: "Founder" },
		],
	},
	{
		key: "bramblecote",
		name: "Bramblecote Media Ltd",
		domain: "bramblecote-media.example",
		industry: "Media agency",
		city: "Southampton",
		country: "United Kingdom",
		countryCode: "GB",
		people: [
			{ first: "Anika", last: "Rawal", title: "Operations Director" },
			{ first: "Declan", last: "Fairweather", title: "Office Assistant" },
		],
	},
	{
		key: "almendra",
		name: "Almendra Cosmetica SL",
		domain: "almendra-cosmetica.example",
		industry: "Cosmetics",
		city: "Valencia",
		country: "Spain",
		countryCode: "ES",
		people: [
			{ first: "Lucia", last: "Ortuno", title: "Purchasing Officer" },
			{ first: "Jordi", last: "Canals", title: "Plant Manager" },
		],
	},
	{
		key: "wierzbak",
		name: "Wierzbak Elektro Sp. z o.o.",
		domain: "wierzbak-elektro.example",
		industry: "Electrical wholesale",
		city: "Poznan",
		country: "Poland",
		countryCode: "PL",
		people: [
			{ first: "Magdalena", last: "Sowinska", title: "Head of Operations" },
		],
	},
	{
		key: "tarcal",
		name: "Tarcal Print Kft.",
		domain: "tarcal-print.example",
		industry: "Printing",
		city: "Budapest",
		country: "Hungary",
		countryCode: "HU",
		people: [{ first: "Gergely", last: "Hollosi", title: "Sales Manager" }],
	},
	{
		key: "oostermeer",
		name: "Oostermeer Interieur B.V.",
		domain: "oostermeer-interieur.example",
		industry: "Interior design",
		city: "Utrecht",
		country: "Netherlands",
		countryCode: "NL",
		people: [{ first: "Thijs", last: "Roodveld", title: "Account Manager" }],
	},
	{
		key: "traunblick",
		name: "Traunblick Gastro GmbH",
		domain: "traunblick-gastro.example",
		industry: "Catering",
		city: "Linz",
		country: "Austria",
		countryCode: "AT",
		people: [{ first: "Theresa", last: "Moosbrugger", title: "Purchasing" }],
	},
	{
		key: "ballyfinch",
		name: "Ballyfinch Architects Ltd",
		domain: "ballyfinch-architects.example",
		industry: "Architecture",
		city: "Cork",
		country: "Ireland",
		countryCode: "IE",
		people: [{ first: "Siobhan", last: "Carrig", title: "Managing Director" }],
	},
	{
		key: "alvorada",
		name: "Alvorada Eventos Lda",
		domain: "alvorada-eventos.example",
		industry: "Event management",
		city: "Lisbon",
		country: "Portugal",
		countryCode: "PT",
		people: [{ first: "Tiago", last: "Serrano", title: "Technical Director" }],
	},
	{
		key: "morsko",
		name: "Morsko Textil OOD",
		domain: "morsko-textil.example",
		industry: "Textile production",
		city: "Varna",
		country: "Bulgaria",
		countryCode: "BG",
		people: [{ first: "Radostina", last: "Petkova", title: "Senior Buyer" }],
	},
	{
		key: "norrebakke",
		name: "Norrebakke Bageri ApS",
		domain: "norrebakke-bageri.example",
		industry: "Bakery chain",
		city: "Aalborg",
		country: "Denmark",
		countryCode: "DK",
		people: [{ first: "Frederik", last: "Holmgaard", title: "COO" }],
	},
	{
		key: "tannhoff",
		name: "Tannhoff Beratung GmbH",
		domain: "tannhoff-beratung.example",
		industry: "Consulting",
		city: "Duesseldorf",
		country: "Germany",
		countryCode: "DE",
		people: [
			{ first: "Annette", last: "Voskuhl", title: "Head of Purchasing" },
		],
	},
	{
		key: "kadakas",
		name: "Kadakas Digital OU",
		domain: "kadakas-digital.example",
		industry: "IT services",
		city: "Tallinn",
		country: "Estonia",
		countryCode: "EE",
		people: [{ first: "Mart", last: "Kuusik", title: "Commercial Manager" }],
	},
	{
		key: "scaligera",
		name: "Scaligera Ottica Srl",
		domain: "scaligera-ottica.example",
		industry: "Optician chain",
		city: "Verona",
		country: "Italy",
		countryCode: "IT",
		people: [
			{ first: "Federica", last: "Zanotti", title: "Procurement Manager" },
		],
	},
	{
		key: "whitcliff",
		name: "Whitcliff Accountants Ltd",
		domain: "whitcliff-accountants.example",
		industry: "Accounting",
		city: "Dover",
		country: "United Kingdom",
		countryCode: "GB",
		people: [{ first: "Grace", last: "Adeyemi", title: "Senior Consultant" }],
	},
	{
		key: "solvik",
		name: "Solvik Spelstudio AB",
		domain: "solvik-spelstudio.example",
		industry: "Game studio",
		city: "Stockholm",
		country: "Sweden",
		countryCode: "SE",
		people: [{ first: "Maja", last: "Ekstrand", title: "IT Manager" }],
	},
	{
		key: "havelgrund",
		name: "Havelgrund Gartenbau GmbH",
		domain: "havelgrund-gartenbau.example",
		industry: "Horticulture",
		city: "Potsdam",
		country: "Germany",
		countryCode: "DE",
		people: [{ first: "Lukas", last: "Stendel", title: "Managing Director" }],
	},
	{
		key: "ourthe",
		name: "Ourthe Sport SRL",
		domain: "ourthe-sport.example",
		industry: "Sporting goods",
		city: "Liege",
		country: "Belgium",
		countryCode: "BE",
		people: [{ first: "Julien", last: "Lambotte", title: "Team Lead" }],
	},
];

const CANDIDATES: Candidate[] = [
	{
		contact: "lindenhof-1",
		threads: [
			{
				kind: "deal",
				product: "Standard kits",
				qty: 24,
				ref: "PO 48117",
				endDaysAgo: 2,
				take: 3,
			},
			{
				kind: "delivery",
				product: "Standard kits",
				qty: null,
				ref: "ORD 21044",
				endDaysAgo: 9,
				take: 3,
			},
			{
				kind: "claim",
				product: "Spare parts",
				qty: null,
				ref: "ORD 20988",
				endDaysAgo: 21,
				take: 4,
			},
			{
				kind: "invoice",
				product: "Spare parts",
				qty: null,
				ref: "INV 2026-1187",
				endDaysAgo: 38,
				take: 4,
			},
			{
				kind: "meeting",
				product: "Standard kits",
				qty: null,
				ref: "Q4 review",
				endDaysAgo: 52,
				take: 2,
			},
			{
				kind: "inquiry",
				product: "Premium kits",
				qty: 40,
				ref: "RFQ 1180",
				endDaysAgo: 74,
				take: 4,
			},
			{
				kind: "deal",
				product: "Spare parts",
				qty: 8,
				ref: "PO 47902",
				endDaysAgo: 95,
				take: 4,
			},
			{
				kind: "deal",
				product: "Accessories",
				qty: 6,
				ref: "PO 47655",
				endDaysAgo: 118,
				take: 3,
			},
		],
		memory: {
			summary:
				"Three orders this year: standard kits, spare parts and accessories. One complaint about damaged goods, settled with a replacement. Asks for a fixed price list for next year and orders every quarter.",
			didBusiness: 3,
			openInquiries: 1,
			maxPallets: 40,
			products: ["Standard kits", "Spare parts", "Accessories"],
			lastOutcome: "DEAL_DONE",
		},
	},
	{
		contact: "lindenhof-2",
		threads: [
			{
				kind: "paperwork",
				product: "Standard kits",
				qty: null,
				ref: "ORD 20931",
				endDaysAgo: 8,
				take: 3,
			},
		],
		memory: {
			summary:
				"Handles the order paperwork and the delivery dates for the Hamburg store.",
			didBusiness: 0,
			openInquiries: 0,
			maxPallets: null,
			products: ["Standard kits"],
			lastOutcome: "OTHER",
		},
	},
	{
		contact: "lindenhof-3",
		threads: [
			{
				kind: "followup",
				product: "Standard kits",
				qty: 24,
				ref: "OFR 2207",
				endDaysAgo: 19,
				take: 2,
			},
		],
		memory: {
			summary:
				"Signed off the annual contract. Wants a review meeting before the next year starts.",
			didBusiness: 0,
			openInquiries: 1,
			maxPallets: null,
			products: ["Standard kits"],
			lastOutcome: "OPEN_OFFER_OURS",
		},
	},
	{
		contact: "brakelsveld-1",
		threads: [
			{
				kind: "inquiry",
				product: "Premium kits",
				qty: 700,
				ref: "RFQ 1233",
				endDaysAgo: 12,
				take: 3,
			},
			{
				kind: "followup",
				product: "Starter kits",
				qty: 120,
				ref: "OFR 2190",
				endDaysAgo: 64,
				take: 2,
			},
		],
		memory: {
			summary:
				"Asked for 700 premium kits for the Rotterdam branch. Waiting for a decision on split delivery.",
			didBusiness: 0,
			openInquiries: 1,
			maxPallets: 700,
			products: ["Premium kits", "Starter kits"],
			lastOutcome: "OPEN_INQUIRY_THEIRS",
		},
	},
	{
		contact: "brakelsveld-2",
		threads: [
			{
				kind: "followup",
				product: "Premium kits",
				qty: 700,
				ref: "OFR 2241",
				endDaysAgo: 14,
				take: 3,
			},
		],
		memory: {
			summary:
				"Owner. Approves anything above 500 units himself and wants the price fixed for six months.",
			didBusiness: 0,
			openInquiries: 0,
			maxPallets: 700,
			products: ["Premium kits"],
			lastOutcome: "OPEN_OFFER_OURS",
		},
	},
	{
		contact: "warnow-1",
		threads: [
			{
				kind: "inquiry",
				product: "Accessories",
				qty: null,
				ref: "RFQ 1204",
				endDaysAgo: 25,
				take: 3,
			},
			{
				kind: "inquiry",
				product: "Starter kits",
				qty: null,
				ref: "RFQ 1187",
				endDaysAgo: 58,
				take: 3,
			},
		],
		memory: {
			summary:
				"Two open requests, accessories and starter kits for the Rostock plant. Both quoted, no quantity confirmed yet.",
			didBusiness: 0,
			openInquiries: 2,
			maxPallets: null,
			products: ["Accessories", "Starter kits"],
			lastOutcome: "OPEN_INQUIRY_THEIRS",
		},
	},
	{
		contact: "vautrin-1",
		threads: [
			{
				kind: "deal",
				product: "Starter kits",
				qty: 18,
				ref: "PO 47710",
				endDaysAgo: 40,
				take: 3,
			},
			{
				kind: "inquiry",
				product: "Custom builds",
				qty: 12,
				ref: "RFQ 1150",
				endDaysAgo: 102,
				take: 4,
			},
		],
		memory: {
			summary:
				"One pilot order of starter kits for the Lyon studio. Interested in custom builds if the lead time drops.",
			didBusiness: 1,
			openInquiries: 0,
			maxPallets: 18,
			products: ["Starter kits", "Custom builds"],
			lastOutcome: "DEAL_DONE",
		},
	},
	{
		contact: "vautrin-2",
		threads: [
			{
				kind: "paperwork",
				product: "Starter kits",
				qty: null,
				ref: "ORD 20744",
				endDaysAgo: 44,
				take: 4,
			},
		],
		memory: {
			summary: "Handles the incoming goods at the Lyon studio.",
			didBusiness: 0,
			openInquiries: 0,
			maxPallets: null,
			products: ["Starter kits"],
			lastOutcome: "OTHER",
		},
	},
	{
		contact: "pizolt-1",
		threads: [
			{
				kind: "followup",
				product: "Spare parts",
				qty: null,
				ref: "OFR 2102",
				endDaysAgo: 70,
				take: 2,
			},
		],
		memory: {
			summary:
				"Asked about spare parts for the office equipment. Their last message has no reply yet.",
			didBusiness: 0,
			openInquiries: 0,
			maxPallets: null,
			products: ["Spare parts"],
			lastOutcome: "OPEN_OFFER_OURS",
		},
	},
	{
		contact: "verdalba-1",
		threads: [
			{
				kind: "inquiry",
				product: "Refill packs",
				qty: 1200,
				ref: "RFQ 1228",
				endDaysAgo: 18,
				take: 4,
			},
			{
				kind: "deal",
				product: "Refill packs",
				qty: 600,
				ref: "PO 47588",
				endDaysAgo: 121,
				take: 3,
			},
		],
		memory: {
			summary:
				"Buys refill packs for the Genoa hotels from us. Now asks for 1,200 units per month for the winter season.",
			didBusiness: 0,
			openInquiries: 1,
			maxPallets: 1200,
			products: ["Refill packs"],
			lastOutcome: "QUOTED",
		},
	},
	{
		contact: "fjellbru-1",
		threads: [
			{
				kind: "inquiry",
				product: "Custom builds",
				qty: null,
				ref: "RFQ 1211",
				endDaysAgo: 55,
				take: 3,
			},
			{
				kind: "followup",
				product: "Spare parts",
				qty: null,
				ref: "OFR 2160",
				endDaysAgo: 83,
				take: 2,
			},
		],
		memory: {
			summary:
				"One open inquiry for custom builds for the Bergen site. Asked for a split delivery.",
			didBusiness: 0,
			openInquiries: 1,
			maxPallets: null,
			products: ["Custom builds", "Spare parts"],
			lastOutcome: "OPEN_INQUIRY_THEIRS",
		},
	},
	{
		contact: "kvarnby-1",
		threads: [
			{
				kind: "followup",
				product: "Standard kits",
				qty: null,
				ref: "OFR 2088",
				endDaysAgo: 95,
				take: 3,
			},
		],
		memory: {
			summary: "Received an offer for standard kits. No reaction since.",
			didBusiness: 0,
			openInquiries: 0,
			maxPallets: null,
			products: ["Standard kits"],
			lastOutcome: "OPEN_OFFER_OURS",
		},
	},
	{
		contact: "bramblecote-1",
		threads: [
			{
				kind: "inquiry",
				product: "Premium kits",
				qty: 350,
				ref: "RFQ 1219",
				endDaysAgo: 33,
				take: 4,
			},
		],
		memory: {
			summary:
				"Asked for 350 premium kits delivered to Southampton. Quoted, waiting on their purchasing round.",
			didBusiness: 0,
			openInquiries: 0,
			maxPallets: 350,
			products: ["Premium kits"],
			lastOutcome: "QUOTED",
		},
	},
	{
		contact: "almendra-1",
		threads: [
			{
				kind: "inquiry",
				product: "Accessories",
				qty: null,
				ref: "RFQ 1132",
				endDaysAgo: 120,
				take: 3,
			},
		],
		memory: {
			summary:
				"Small inquiry for accessories. Still open, they never confirmed the quantity.",
			didBusiness: 0,
			openInquiries: 1,
			maxPallets: null,
			products: ["Accessories"],
			lastOutcome: "OPEN_INQUIRY_THEIRS",
		},
	},
	{
		contact: "wierzbak-1",
		threads: [
			{
				kind: "deal",
				product: "Consumables",
				qty: 260,
				ref: "PO 48090",
				endDaysAgo: 9,
				take: 3,
			},
			{
				kind: "inquiry",
				product: "Starter kits",
				qty: 80,
				ref: "RFQ 1240",
				endDaysAgo: 15,
				take: 3,
			},
		],
		memory: {
			summary:
				"Regular buyer of consumables for the Poznan branch. A new request for starter kits is open.",
			didBusiness: 1,
			openInquiries: 1,
			maxPallets: 260,
			products: ["Consumables", "Starter kits"],
			lastOutcome: "OPEN_INQUIRY_THEIRS",
		},
	},
	{
		contact: "tarcal-1",
		threads: [
			{
				kind: "followup",
				product: "Custom builds",
				qty: null,
				ref: "OFR 2051",
				endDaysAgo: 150,
				take: 2,
			},
		],
		memory: {
			summary:
				"Asked for a custom build in a smaller size. Their reply is still unanswered.",
			didBusiness: 0,
			openInquiries: 0,
			maxPallets: null,
			products: ["Custom builds"],
			lastOutcome: "OPEN_OFFER_OURS",
		},
	},
];

const DEALS: DealSpec[] = [
	{
		key: "1",
		name: "Standard kits annual contract",
		company: "lindenhof",
		contact: "lindenhof-1",
		stage: DealStage.CLOSED_WON,
		amount: 48_500,
		createdDaysAgo: 140,
		closedDaysAgo: 12,
		closesInDays: null,
		closedReason: null,
	},
	{
		key: "2",
		name: "Consumables Q3 order",
		company: "wierzbak",
		contact: "wierzbak-1",
		stage: DealStage.CLOSED_WON,
		amount: 21_900,
		createdDaysAgo: 95,
		closedDaysAgo: 35,
		closesInDays: null,
		closedReason: null,
	},
	{
		key: "3",
		name: "Refill packs for the Genoa hotels",
		company: "verdalba",
		contact: "verdalba-1",
		stage: DealStage.CLOSED_WON,
		amount: 63_200,
		createdDaysAgo: 170,
		closedDaysAgo: 80,
		closesInDays: null,
		closedReason: null,
	},
	{
		key: "4",
		name: "Starter kits pilot",
		company: "vautrin",
		contact: "vautrin-1",
		stage: DealStage.CLOSED_LOST,
		amount: 9_800,
		createdDaysAgo: 75,
		closedDaysAgo: 20,
		closesInDays: null,
		closedReason: "Chose a local supplier",
	},
	{
		key: "5",
		name: "Starter kits frame contract",
		company: "wierzbak",
		contact: "wierzbak-1",
		stage: DealStage.CONTRACT_SENT,
		amount: 27_600,
		createdDaysAgo: 30,
		closedDaysAgo: null,
		closesInDays: 9,
		closedReason: null,
	},
	{
		key: "6",
		name: "Premium kits 700 units",
		company: "brakelsveld",
		contact: "brakelsveld-1",
		stage: DealStage.DECISION_MAKER_BOUGHT_IN,
		amount: 38_400,
		createdDaysAgo: 22,
		closedDaysAgo: null,
		closesInDays: 12,
		closedReason: null,
	},
	{
		key: "7",
		name: "Refill packs for three offices",
		company: "kadakas",
		contact: "kadakas-1",
		stage: DealStage.DECISION_MAKER_BOUGHT_IN,
		amount: 54_000,
		createdDaysAgo: 45,
		closedDaysAgo: null,
		closesInDays: 40,
		closedReason: null,
	},
	{
		key: "8",
		name: "Accessories supply",
		company: "warnow",
		contact: "warnow-2",
		stage: DealStage.QUALIFIED_TO_BUY,
		amount: 17_250,
		createdDaysAgo: 18,
		closedDaysAgo: null,
		closesInDays: 30,
		closedReason: null,
	},
	{
		key: "9",
		name: "Premium kits Southampton",
		company: "bramblecote",
		contact: "bramblecote-1",
		stage: DealStage.QUALIFIED_TO_BUY,
		amount: 12_400,
		createdDaysAgo: 12,
		closedDaysAgo: null,
		closesInDays: 45,
		closedReason: null,
	},
	{
		key: "10",
		name: "Custom builds season order",
		company: "havelgrund",
		contact: "havelgrund-1",
		stage: DealStage.QUALIFIED_TO_BUY,
		amount: 29_900,
		createdDaysAgo: 8,
		closedDaysAgo: null,
		closesInDays: 60,
		closedReason: null,
	},
	{
		key: "11",
		name: "Starter kits Stockholm office",
		company: "solvik",
		contact: "solvik-1",
		stage: DealStage.DEMO_BOOKED,
		amount: 8_600,
		createdDaysAgo: 5,
		closedDaysAgo: null,
		closesInDays: 50,
		closedReason: null,
	},
	{
		key: "12",
		name: "Spare parts supply",
		company: "alvorada",
		contact: "alvorada-1",
		stage: DealStage.DEMO_BOOKED,
		amount: 15_300,
		createdDaysAgo: 3,
		closedDaysAgo: null,
		closesInDays: 75,
		closedReason: null,
	},
];

type Voice = {
	owner: string;
	contact: string;
	company: string;
	city: string;
	product: string;
	qty: string;
	ref: string;
};

type Line = { direction: EmailDirection; text: string };

type ThreadTemplate = {
	subject: string;
	lines: Line[];
	outcome: string;
};

const THREADS = {
	inquiry: {
		subject: "Request for quotation: {product}",
		outcome: "OPEN_INQUIRY_THEIRS",
		lines: [
			{
				direction: EmailDirection.INBOUND,
				text: "Hello {owner}, we are looking for {qty} of {product} for our {city} site within the next six weeks. Could you send us a quotation including delivery?",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Hi {contact}, thanks for the request. Attached is our offer for {qty} of {product}, delivered to {city}. Prices are valid for 30 days.",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "Thank you. Is a split delivery in two lots possible, and what is the lead time for the first lot? Purchasing wants to decide this month.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Yes, two lots work for {company}. The first lot ships within ten working days after the order, the second four weeks later.",
			},
		],
	},
	deal: {
		subject: "Purchase order {ref}: {product}",
		outcome: "DEAL_DONE",
		lines: [
			{
				direction: EmailDirection.INBOUND,
				text: "Hello {owner}, please find our purchase order {ref} for {qty} of {product}. Delivery as discussed to {city}.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Hi {contact}, order {ref} is confirmed. Delivery is planned for the week after next, you get a confirmation the day before.",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "Received in good condition, thank you. We will come back to you for the next order.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Great to hear. I will send the updated price list for {product} before the next order.",
			},
		],
	},
	followup: {
		subject: "Offer {ref} for {product}",
		outcome: "OPEN_OFFER_OURS",
		lines: [
			{
				direction: EmailDirection.OUTBOUND,
				text: "Hi {contact}, following up on our call. Our offer {ref} for {product} is attached, {qty} per month with a fixed price for six months.",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "Thanks {owner}. We are reviewing it with purchasing and will get back to you by the end of the month.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Sounds good. If the volume changes, the price per unit stays the same up to 20 percent more.",
			},
		],
	},
	paperwork: {
		subject: "Documents for order {ref}",
		outcome: "OTHER",
		lines: [
			{
				direction: EmailDirection.INBOUND,
				text: "Hello {owner}, for order {ref} we still need the signed order form and the billing address before we can release it.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Hi {contact}, both documents are attached. Let me know if your accounting needs anything else.",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "All good, the order was released this morning. Thanks for the quick turnaround.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Perfect. The next {product} order for {city} gets the same documents upfront.",
			},
		],
	},
	delivery: {
		subject: "Delivery note for order {ref}",
		outcome: "OTHER",
		lines: [
			{
				direction: EmailDirection.INBOUND,
				text: "Hello {owner}, the delivery note for order {ref} lists 22 units but we received 24. Can you send a corrected note so we can book the goods in?",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Hi {contact}, sorry about that. The corrected delivery note with 24 units of {product} is attached.",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "Received, the goods are booked in. Thanks for the quick fix.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Glad it is sorted. The next delivery gets a double check before dispatch.",
			},
		],
	},
	invoice: {
		subject: "Invoice {ref}",
		outcome: "OTHER",
		lines: [
			{
				direction: EmailDirection.OUTBOUND,
				text: "Hi {contact}, invoice {ref} for the last {product} delivery is attached. Payment terms are 30 days as agreed.",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "Thanks {owner}. Accounting needs our purchase order number on the invoice before they can release it.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Understood, the corrected invoice with your order number is attached.",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "Perfect, it is approved for payment on the next run.",
			},
		],
	},
	claim: {
		subject: "Complaint: damaged goods in order {ref}",
		outcome: "OTHER",
		lines: [
			{
				direction: EmailDirection.INBOUND,
				text: "Hello {owner}, 12 units of {product} from order {ref} arrived with scratches and dented corners. Photos are attached. How do we proceed?",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Hi {contact}, sorry to see that. We can send a credit note or replace the 12 units next week. Which do you prefer?",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "Replacement please, we need the stock for the {city} site.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Done, the 12 replacement units ship on Monday at no charge.",
			},
		],
	},
	meeting: {
		subject: "Meeting request: {ref}",
		outcome: "OTHER",
		lines: [
			{
				direction: EmailDirection.OUTBOUND,
				text: "Hi {contact}, could we meet in {city} in the coming weeks for a review of the Q4 volumes and the price list for next year?",
			},
			{
				direction: EmailDirection.INBOUND,
				text: "Hi {owner}, Tuesday at 10:00 works for us. Come to the main office, I will book the meeting room.",
			},
			{
				direction: EmailDirection.OUTBOUND,
				text: "Tuesday 10:00 is confirmed. I will bring the volume overview and the draft price list.",
			},
		],
	},
} satisfies Record<ThreadKind, ThreadTemplate>;

type Note = {
	key: string;
	type: ActivityType;
	subject: string;
	body: string;
	daysAgo: number | null;
	dueInDays: number | null;
};

const SHOWCASE_NOTES: Note[] = [
	{
		key: "note",
		type: ActivityType.NOTE,
		subject: "Renewal notes",
		body: "Jana prefers calls before 10:00. The annual contract renews in January and she wants the price list two weeks before that.",
		daysAgo: 30,
		dueInDays: null,
	},
	{
		key: "call",
		type: ActivityType.CALL,
		subject: "Call about the damaged goods complaint",
		body: "Agreed on a replacement of the 12 units instead of a credit note. Jana is fine with the Monday delivery.",
		daysAgo: 20,
		dueInDays: null,
	},
	{
		key: "task",
		type: ActivityType.TASK,
		subject: "Send the Q4 price list to Jana",
		body: "Include the fixed price for standard kits and the new spare parts range.",
		daysAgo: null,
		dueInDays: DEMO.showcase.taskDueInDays,
	},
];

let seedNow = Date.now();

let copy: DemoCopy = demoCopy(DEFAULT_LOCALE);

function daysAgo(days: number, hour = 9): Date {
	const date = new Date(seedNow - days * DAY_MS);
	date.setUTCHours(hour, 15, 0, 0);
	return date;
}

function daysAhead(days: number): Date {
	return daysAgo(-days, 12);
}

function id(...parts: (string | number)[]): string {
	return `${DEMO.prefix}${parts.join("-")}`;
}

function bare(prefixed: string): string {
	return prefixed.slice(DEMO.prefix.length);
}

function emailOf(person: Person, domain: string): string {
	return `${person.first}.${person.last}@${domain}`.toLowerCase();
}

function firstSentence(text: string): string {
	return text.split(/(?<=\.)\s/)[0] ?? text;
}

function quantityText(qty: number | null): string {
	return qty === null
		? copy.t("a first batch")
		: copy.t("{qty} units", { qty: copy.number(qty) });
}

function linesOf(spec: ThreadSpec): Line[] {
	return THREADS[spec.kind].lines.slice(0, spec.take);
}

type DemoDb = Prisma.TransactionClient;

type Owner = { id: string; name: string; email: string };

type ContactRef = { id: string; person: Person; company: Company };

type Verdict = { standing: ContactStanding; potential: ContactPotential };

const STANDING_ORDER: ContactStanding[] = ["watch", "interested", "customer"];
const POTENTIAL_ORDER: ContactPotential[] = ["low", "medium", "high"];

function contactsOf(): Map<string, ContactRef> {
	const map = new Map<string, ContactRef>();
	for (const company of COMPANIES) {
		company.people.forEach((person, index) => {
			const key = `${company.key}-${index + 1}`;
			map.set(key, { id: id("ct", key), person, company });
		});
	}
	return map;
}

function signalOf(spec: ThreadSpec): ThreadSignal {
	const lines = linesOf(spec);
	return {
		relevant: true,
		outcome: THREADS[spec.kind].outcome,
		quantityPallets: spec.qty,
		unansweredByUs:
			lines[lines.length - 1]?.direction === EmailDirection.INBOUND,
		products: [spec.product],
		topics: [spec.product],
	};
}

async function verdictsOf(db: Db): Promise<Map<string, Verdict>> {
	const rules = await readWinBackRules(db);
	const rule: QuantityRule = {
		minPallets: rules.business.minPallets,
		minBoxes: rules.business.minBoxes,
		boxProducts: rules.business.boxProducts,
	};
	const byContact = new Map(CANDIDATES.map((c) => [c.contact, c]));
	const verdicts = new Map<string, Verdict>();

	for (const key of contactsOf().keys()) {
		const candidate = byContact.get(key);
		verdicts.set(
			key,
			standingOf(
				{
					hasDeal: DEALS.some((deal) => deal.contact === key),
					verdict: null,
					insights: candidate?.threads.map(signalOf) ?? [],
					unreadThreads: 0,
					knownPallets: candidate?.memory.maxPallets ?? null,
					products: rules.business.products,
				},
				rule,
			),
		);
	}

	return verdicts;
}

function companyVerdict(
	company: Company,
	verdicts: Map<string, Verdict>,
): Verdict {
	let standing: ContactStanding = "watch";
	let potential: ContactPotential = "low";

	company.people.forEach((_, index) => {
		const verdict = verdicts.get(`${company.key}-${index + 1}`);
		if (!verdict) return;
		if (
			STANDING_ORDER.indexOf(verdict.standing) >
			STANDING_ORDER.indexOf(standing)
		) {
			standing = verdict.standing;
		}
		if (
			POTENTIAL_ORDER.indexOf(verdict.potential) >
			POTENTIAL_ORDER.indexOf(potential)
		) {
			potential = verdict.potential;
		}
	});

	return { standing, potential };
}

export async function resolveDemoOwner(db: Db): Promise<Owner> {
	const workspace = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { name: true, slug: true },
	});
	if (!workspace) {
		throw new Error(
			"No workspace exists yet. Sign in once, then run this again.",
		);
	}

	const select = { user: { select: { id: true, name: true, email: true } } };
	const member =
		(await db.member.findFirst({
			where: { organizationId: WORKSPACE_ID, role: "owner" },
			orderBy: { createdAt: "asc" },
			select,
		})) ??
		(await db.member.findFirst({
			where: { organizationId: WORKSPACE_ID },
			orderBy: { createdAt: "asc" },
			select,
		}));
	if (!member) {
		throw new Error(
			"The workspace has no member. Run scripts/create-owner.ts first.",
		);
	}

	return member.user;
}

async function writeCompanies(
	db: DemoDb,
	owner: Owner,
	verdicts: Map<string, Verdict>,
): Promise<void> {
	for (const [index, company] of COMPANIES.entries()) {
		const verdict = companyVerdict(company, verdicts);
		const data = {
			name: company.name,
			domain: company.domain,
			website: `https://www.${company.domain}`,
			industry: copy.t(company.industry),
			city: company.city,
			country: copy.t(company.country),
			countryCode: company.countryCode,
			ownerId: owner.id,
			standing: verdict.standing,
			potentialBand: verdict.potential,
			enrichmentStatus: EnrichmentStatus.COMPLETE,
			enrichedAt: daysAgo(200 - index * 6),
			source: RecordSource.MANUAL,
			archivedAt: null,
			createdAt: daysAgo(210 - index * 6),
		};
		await db.company.upsert({
			where: { id: id("co", company.key) },
			create: { id: id("co", company.key), ...data },
			update: data,
		});
	}
}

async function writeContacts(
	db: DemoDb,
	owner: Owner,
	contacts: Map<string, ContactRef>,
	verdicts: Map<string, Verdict>,
): Promise<void> {
	let index = 0;
	for (const [key, ref] of contacts) {
		const verdict = verdicts.get(key);
		const data = {
			firstName: ref.person.first,
			lastName: ref.person.last,
			email: emailOf(ref.person, ref.company.domain),
			title: copy.t(ref.person.title),
			companyId: id("co", ref.company.key),
			ownerId: owner.id,
			standing: verdict?.standing ?? null,
			potentialBand: verdict?.potential ?? null,
			enrichmentStatus: EnrichmentStatus.COMPLETE,
			enrichedAt: daysAgo(190 - index * 4),
			socialsCheckedAt: daysAgo(190 - index * 4),
			cleanedAt: daysAgo(190 - index * 4),
			source: RecordSource.MANUAL,
			archivedAt: null,
			createdAt: daysAgo(200 - index * 4),
		};
		await db.contact.upsert({
			where: { id: ref.id },
			create: { id: ref.id, ...data },
			update: data,
		});
		index += 1;
	}
}

async function writeDeals(
	reader: Db,
	db: DemoDb,
	owner: Owner,
	contacts: Map<string, ContactRef>,
): Promise<void> {
	const base = await readReportingCurrency(reader);
	for (const deal of DEALS) {
		const contact = contacts.get(deal.contact);
		if (!contact) throw new Error(`Unknown contact ${deal.contact}`);

		const amount = new Prisma.Decimal(deal.amount);
		const fx = await convertToBase(reader, amount, DEMO.currency, base);
		const createdAt = daysAgo(deal.createdDaysAgo, 10);
		const closedAt =
			deal.closedDaysAgo === null ? null : daysAgo(deal.closedDaysAgo, 16);
		const data = {
			name: copy.t(deal.name),
			companyId: id("co", deal.company),
			ownerId: owner.id,
			stage: deal.stage,
			stageChangedAt: closedAt ?? createdAt,
			amount,
			currency: DEMO.currency,
			expectedCloseDate:
				deal.closesInDays === null ? null : daysAhead(deal.closesInDays),
			closedAt,
			closedReason: deal.closedReason ? copy.t(deal.closedReason) : null,
			baseAmount: fx?.baseAmount ?? null,
			baseCurrency: fx?.baseCurrency ?? null,
			fxRate: fx?.fxRate ?? null,
			fxRateAt: fx?.fxRateAt ?? null,
			lastActivityAt: closedAt ?? createdAt,
			archivedAt: null,
			createdAt,
		};
		const dealId = id("deal", deal.key);
		await db.deal.upsert({
			where: { id: dealId },
			create: { id: dealId, ...data },
			update: data,
		});
		await db.dealContact.upsert({
			where: { dealId_contactId: { dealId, contactId: contact.id } },
			create: { dealId, contactId: contact.id, role: copy.t("Buyer") },
			update: { role: copy.t("Buyer") },
		});
	}
}

async function writeThread(
	db: DemoDb,
	owner: Owner,
	ref: ContactRef,
	spec: ThreadSpec,
	threadId: string,
): Promise<Date> {
	const template = THREADS[spec.kind];
	const product = copy.t(spec.product);
	const voice: Voice = {
		owner: owner.name.split(" ")[0] ?? owner.name,
		contact: ref.person.first,
		company: ref.company.name,
		city: ref.company.city,
		product: copy.inSentence(product),
		qty: quantityText(spec.qty),
		ref: copy.t(spec.ref),
	};
	const lines = linesOf(spec);
	const subject = copy.t(template.subject, { ...voice, product });
	const contactEmail = emailOf(ref.person, ref.company.domain);
	const contactName = `${ref.person.first} ${ref.person.last}`;
	const rootMessageId = `<${id("msg", bare(threadId), 1)}@${ref.company.domain}>`;
	const sentAt = lines.map((_, index) =>
		daysAgo(
			spec.endDaysAgo + (lines.length - 1 - index) * DEMO.message.gapDays,
			DEMO.message.firstHour + index * DEMO.message.hourStep,
		),
	);
	const first = sentAt[0] ?? daysAgo(spec.endDaysAgo);
	const last = sentAt[sentAt.length - 1] ?? first;

	const threadData = {
		rootMessageId,
		subject,
		classification: "RELEVANT",
		companyId: id("co", ref.company.key),
		contactId: ref.id,
		firstMessageAt: first,
		lastMessageAt: last,
		messageCount: lines.length,
		createdAt: first,
	};
	await db.emailThread.upsert({
		where: { id: threadId },
		create: { id: threadId, ...threadData },
		update: threadData,
	});

	for (const [index, line] of lines.entries()) {
		const outbound = line.direction === EmailDirection.OUTBOUND;
		const body = copy.t(line.text, voice);
		const messageId = id("msg", bare(threadId), index + 1);
		const data = {
			threadId,
			rfcMessageId: `<${messageId}@${ref.company.domain}>`,
			syncedByUserId: owner.id,
			gmailMessageId: id("gm", bare(threadId), index + 1),
			direction: line.direction,
			fromEmail: outbound ? owner.email : contactEmail,
			fromName: outbound ? owner.name : contactName,
			recipients: [
				outbound
					? { email: contactEmail, name: contactName, kind: "to" }
					: { email: owner.email, name: owner.name, kind: "to" },
			],
			subject: index === 0 ? subject : `Re: ${subject}`,
			snippet: body.slice(0, DEMO.snippetChars),
			body,
			summary: firstSentence(body),
			sentAt: sentAt[index] ?? last,
			createdAt: sentAt[index] ?? last,
		};
		await db.emailMessage.upsert({
			where: { id: messageId },
			create: { id: messageId, ...data },
			update: data,
		});
	}

	await db.emailMessage.deleteMany({
		where: {
			threadId,
			id: {
				startsWith: DEMO.prefix,
				notIn: lines.map((_, index) => id("msg", bare(threadId), index + 1)),
			},
		},
	});

	const signal = signalOf(spec);
	const insightId = id("ins", bare(threadId));
	const insight = {
		threadId,
		relevant: signal.relevant,
		topics: [product],
		side: "THEY_BUY",
		products: [product],
		quantityPallets: signal.quantityPallets,
		loads: null,
		outcome: signal.outcome,
		unansweredByUs: signal.unansweredByUs,
		summary: copy.t(
			"{company} and {owner} about {product}, {qty}, reference {ref}.",
			voice,
		),
		evidence: [firstSentence(lines[0] ? copy.t(lines[0].text, voice) : "")],
		modelId: DEMO.modelId,
		lastMessageAt: last,
		createdAt: last,
	};
	await db.threadInsight.upsert({
		where: { id: insightId },
		create: { id: insightId, ...insight },
		update: insight,
	});

	const activityId = id("act", bare(threadId));
	const lastLine = lines[lines.length - 1];
	const activity = {
		type: ActivityType.EMAIL,
		subject,
		body: lastLine
			? copy.t(lastLine.text, voice).slice(0, DEMO.snippetChars)
			: null,
		occurredAt: last,
		companyId: id("co", ref.company.key),
		contactId: ref.id,
		createdById: owner.id,
		emailThreadId: threadId,
		meta: { synced: true, source: "gmail" },
		createdAt: last,
	};
	await db.activity.upsert({
		where: { id: activityId },
		create: { id: activityId, ...activity },
		update: activity,
	});

	return last;
}

async function writeShowcaseNotes(
	db: DemoDb,
	owner: Owner,
	ref: ContactRef,
): Promise<void> {
	for (const note of SHOWCASE_NOTES) {
		const at =
			note.daysAgo === null ? daysAgo(1, 8) : daysAgo(note.daysAgo, 11);
		const activityId = id("act", note.key, DEMO.showcase.contact);
		const data = {
			type: note.type,
			subject: copy.t(note.subject),
			body: copy.t(note.body),
			occurredAt: note.dueInDays === null ? at : null,
			dueAt: note.dueInDays === null ? null : daysAhead(note.dueInDays),
			completedAt: null,
			companyId: id("co", ref.company.key),
			contactId: ref.id,
			createdById: owner.id,
			createdAt: at,
		};
		await db.activity.upsert({
			where: { id: activityId },
			create: { id: activityId, ...data },
			update: data,
		});
	}
}

async function writeConversations(
	db: DemoDb,
	owner: Owner,
	contacts: Map<string, ContactRef>,
): Promise<void> {
	const companyLast = new Map<string, Date>();

	for (const candidate of CANDIDATES) {
		const ref = contacts.get(candidate.contact);
		if (!ref) throw new Error(`Unknown contact ${candidate.contact}`);

		const threadIds: string[] = [];
		let lastAt = new Date(0);
		for (const [index, spec] of candidate.threads.entries()) {
			const threadId = id("th", candidate.contact, index + 1);
			threadIds.push(threadId);
			const at = await writeThread(db, owner, ref, spec, threadId);
			if (at > lastAt) lastAt = at;
		}

		await db.emailThread.deleteMany({
			where: {
				contactId: ref.id,
				id: { startsWith: DEMO.prefix, notIn: threadIds },
			},
		});

		if (candidate.contact === DEMO.showcase.contact) {
			await writeShowcaseNotes(db, owner, ref);
		}

		const memoryId = id("mem", candidate.contact);
		const memory = {
			contactId: ref.id,
			summary: copy.t(candidate.memory.summary),
			didBusiness: candidate.memory.didBusiness,
			openInquiries: candidate.memory.openInquiries,
			maxPallets: candidate.memory.maxPallets,
			products: candidate.memory.products.map((item) => copy.t(item)),
			lastOutcome: candidate.memory.lastOutcome,
			coveredThreadIds: threadIds,
			modelId: DEMO.modelId,
		};
		await db.contactMemory.upsert({
			where: { id: memoryId },
			create: { id: memoryId, ...memory },
			update: memory,
		});

		await db.contact.update({
			where: { id: ref.id },
			data: { lastActivityAt: lastAt },
		});

		const companyId = id("co", ref.company.key);
		const known = companyLast.get(companyId);
		if (!known || lastAt > known) companyLast.set(companyId, lastAt);
	}

	for (const [companyId, lastActivityAt] of companyLast) {
		await db.company.update({
			where: { id: companyId },
			data: { lastActivityAt },
		});
	}
}

export function demoTexts(): string[] {
	const texts = new Set<string>([
		"a first batch",
		"{qty} units",
		"{company} and {owner} about {product}, {qty}, reference {ref}.",
		"Buyer",
	]);
	for (const company of COMPANIES) {
		texts.add(company.industry);
		texts.add(company.country);
		for (const person of company.people) texts.add(person.title);
	}
	for (const candidate of CANDIDATES) {
		texts.add(candidate.memory.summary);
		for (const item of candidate.memory.products) texts.add(item);
		for (const thread of candidate.threads) {
			texts.add(thread.product);
			if (/[a-z]/.test(thread.ref)) texts.add(thread.ref);
		}
	}
	for (const deal of DEALS) {
		texts.add(deal.name);
		if (deal.closedReason) texts.add(deal.closedReason);
	}
	for (const template of Object.values(THREADS)) {
		texts.add(template.subject);
		for (const line of template.lines) texts.add(line.text);
	}
	for (const note of SHOWCASE_NOTES) {
		texts.add(note.subject);
		texts.add(note.body);
	}
	return [...texts];
}

const PREFIXED = { id: { startsWith: DEMO.prefix } };

const ABOUT_DEMO = {
	OR: [
		{ contactId: { startsWith: DEMO.prefix } },
		{ companyId: { startsWith: DEMO.prefix } },
		{ dealId: { startsWith: DEMO.prefix } },
	],
};

export async function demoCounts(db: DemoDb): Promise<Record<string, number>> {
	return {
		companies: await db.company.count({ where: PREFIXED }),
		contacts: await db.contact.count({ where: PREFIXED }),
		deals: await db.deal.count({ where: PREFIXED }),
		dealContacts: await db.dealContact.count({
			where: { dealId: { startsWith: DEMO.prefix } },
		}),
		threads: await db.emailThread.count({ where: PREFIXED }),
		messages: await db.emailMessage.count({ where: PREFIXED }),
		insights: await db.threadInsight.count({ where: PREFIXED }),
		activities: await db.activity.count({ where: PREFIXED }),
		memories: await db.contactMemory.count({ where: PREFIXED }),
		agentTasks: await db.agentTask.count({ where: ABOUT_DEMO }),
	};
}

export async function removeDemoData(
	db: DemoDb,
): Promise<Record<string, number>> {
	return {
		agentEvents: (
			await db.agentEvent.deleteMany({
				where: { contactId: { startsWith: DEMO.prefix } },
			})
		).count,
		agentTasks: (await db.agentTask.deleteMany({ where: ABOUT_DEMO })).count,
		activities: (await db.activity.deleteMany({ where: PREFIXED })).count,
		insights: (await db.threadInsight.deleteMany({ where: PREFIXED })).count,
		messages: (await db.emailMessage.deleteMany({ where: PREFIXED })).count,
		threads: (await db.emailThread.deleteMany({ where: PREFIXED })).count,
		memories: (await db.contactMemory.deleteMany({ where: PREFIXED })).count,
		dealContacts: (
			await db.dealContact.deleteMany({
				where: { dealId: { startsWith: DEMO.prefix } },
			})
		).count,
		deals: (await db.deal.deleteMany({ where: PREFIXED })).count,
		contacts: (await db.contact.deleteMany({ where: PREFIXED })).count,
		companies: (await db.company.deleteMany({ where: PREFIXED })).count,
	};
}

export async function hasDemoData(db: DemoDb): Promise<boolean> {
	const row = await db.company.findFirst({
		where: PREFIXED,
		select: { id: true },
	});

	return row !== null;
}

export async function hasRealData(db: DemoDb): Promise<boolean> {
	const real = { id: { not: { startsWith: DEMO.prefix } } };
	const [companies, contacts, deals, threads] = await Promise.all([
		db.company.findFirst({ where: real, select: { id: true } }),
		db.contact.findFirst({ where: real, select: { id: true } }),
		db.deal.findFirst({ where: real, select: { id: true } }),
		db.emailThread.findFirst({ where: real, select: { id: true } }),
	]);

	return [companies, contacts, deals, threads].some((row) => row !== null);
}

export async function seedDemoData(
	reader: Db,
	db: DemoDb,
	owner: Owner,
	locale: Locale = DEFAULT_LOCALE,
): Promise<Record<string, number>> {
	seedNow = Date.now();
	copy = demoCopy(locale);
	const contacts = contactsOf();
	const verdicts = await verdictsOf(reader);

	await writeCompanies(db, owner, verdicts);
	await writeContacts(db, owner, contacts, verdicts);
	await writeDeals(reader, db, owner, contacts);
	await writeConversations(db, owner, contacts);

	return demoCounts(db);
}
