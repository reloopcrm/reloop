import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type Prisma } from "@crm/db";
import { POTENTIAL_VERDICT, type PotentialVerdict } from "@crm/db/insights";
import { SETTINGS_ID } from "@crm/db/settings";
import {
	DEFAULT_WIN_BACK_RULES,
	readWinBackRules,
	readWinBackRulesState,
	type WinBackRules,
	writeWinBackRules,
} from "@crm/validation/win-back-rules";
import {
	oneSidedReason,
	rankable,
	runRulesTune,
	verdictCounts,
	verdictExamples,
} from "../agent/lib/rules-tuner";

const suffix = process.env.TEST_RUN_ID ?? "rules-tuner-spec";
const domain = `tuner-${suffix}.example.test`;

const NO_POINTS: WinBackRules["points"] = {
	waitingOnUs: 0,
	perEmailFromThem: 0,
	perEmailFromUs: 0,
	perMeeting: 0,
	openDeal: 0,
	wonDeal: 0,
	hasCompany: 0,
	titleKeyword: 0,
	pastBusiness: 0,
	openInquiry: 0,
	bigQuantity: 0,
	productMatch: 0,
	goodFeedback: 0,
};

const MARKED_RULES: WinBackRules = {
	...DEFAULT_WIN_BACK_RULES,
	include: { ...DEFAULT_WIN_BACK_RULES.include, neverReplied: false },
	points: { ...DEFAULT_WIN_BACK_RULES.points, waitingOnUs: 777 },
};

const NO_MODEL = "the tuner asked for a model";

let savedSetting: Prisma.AppSettingUncheckedCreateInput | null = null;

let modelCalls = 0;

async function refuseModel(): Promise<never> {
	modelCalls += 1;
	throw new Error(NO_MODEL);
}

async function verdicts(value: PotentialVerdict, count: number): Promise<void> {
	const people = Array.from({ length: count }, () => ({
		firstName: "Tuner",
		lastName: value,
		email: `${value}.${crypto.randomUUID()}@${domain}`,
	}));

	await db.contact.createMany({ data: people });

	const rows = await db.contact.findMany({
		where: { email: { in: people.map((person) => person.email) } },
		select: { id: true },
	});

	await db.potentialFeedback.createMany({
		data: rows.map((row) => ({ contactId: row.id, verdict: value })),
	});
}

async function verdict(value: PotentialVerdict): Promise<void> {
	await verdicts(value, 1);
}

async function clean(): Promise<void> {
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
}

beforeAll(async () => {
	savedSetting = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
});

beforeEach(async () => {
	modelCalls = 0;
	await clean();
});

afterEach(clean);

afterAll(async () => {
	await clean();
	if (!savedSetting) return;

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: savedSetting,
		update: savedSetting,
	});
});

describe("rankable", () => {
	it("is false when every points value is 0", () => {
		expect(rankable(NO_POINTS)).toBe(false);
	});

	it("is true when at least one value is above 0", () => {
		expect(rankable({ ...NO_POINTS, wonDeal: 5 })).toBe(true);
	});
});

describe("a tune on one sided evidence", () => {
	it("writes the reason as the note and asks for a good verdict first", async () => {
		await writeWinBackRules(db, MARKED_RULES);
		await verdict(POTENTIAL_VERDICT.bad);
		await verdict(POTENTIAL_VERDICT.bad);

		const said = await runRulesTune(refuseModel);

		expect(said).toContain("I see 2 verdicts");
		expect(said).toContain("Worth it");
		expect(said.startsWith("Rules tuned from")).toBe(false);
		expect(modelCalls).toBe(0);

		const kept = await readWinBackRules(db);
		expect(kept.points.waitingOnUs).toBe(777);
		expect(kept.include.neverReplied).toBe(false);

		const state = await readWinBackRulesState(db);
		expect(state.note).toBe(said);
		expect(state.tunedAt).toBeNull();
	});

	it("writes the reason as the note and asks for a bad verdict first", async () => {
		await writeWinBackRules(db, MARKED_RULES);
		await verdict(POTENTIAL_VERDICT.good);

		const said = await runRulesTune(refuseModel);

		expect(said).toContain("I see 1 verdict,");
		expect(said).toContain("Not for us");
		expect(said.startsWith("Rules tuned from")).toBe(false);
		expect(modelCalls).toBe(0);

		const kept = await readWinBackRules(db);
		expect(kept.points.waitingOnUs).toBe(777);
		expect(kept.include.neverReplied).toBe(false);

		const state = await readWinBackRulesState(db);
		expect(state.note).toBe(said);
		expect(state.tunedAt).toBeNull();
	});

	it("names the true number, not the sampled one", async () => {
		await verdicts(POTENTIAL_VERDICT.bad, 25);

		const said = await runRulesTune(refuseModel);

		expect(said).toContain("I see 25 verdicts");
		expect(said).not.toContain("I see 20 verdicts");
		expect(modelCalls).toBe(0);
	});

	it("names no count when there is no verdict at all", async () => {
		const said = await runRulesTune(refuseModel);

		expect(said).toContain("There is no verdict yet");
		expect(said).not.toContain("I see");
		expect(modelCalls).toBe(0);
	});
});

describe("a tune on balanced evidence", () => {
	it("passes the guard and goes on to the model", async () => {
		await verdict(POTENTIAL_VERDICT.good);
		await verdict(POTENTIAL_VERDICT.bad);

		const samples = await verdictExamples();

		expect(samples.map((sample) => sample.verdict).sort()).toEqual([
			"bad",
			"good",
		]);
		expect(oneSidedReason(await verdictCounts())).toBeNull();
	});

	it("reads each verdict on its own, so newer bad rows hide no good ones", async () => {
		await verdicts(POTENTIAL_VERDICT.good, 5);
		await verdicts(POTENTIAL_VERDICT.bad, 60);

		const samples = await verdictExamples();
		const good = samples.filter(
			(sample) => sample.verdict === POTENTIAL_VERDICT.good,
		);
		const bad = samples.filter(
			(sample) => sample.verdict === POTENTIAL_VERDICT.bad,
		);

		expect(good).toHaveLength(5);
		expect(bad).toHaveLength(20);
		expect(oneSidedReason(await verdictCounts())).toBeNull();

		await expect(runRulesTune(refuseModel)).rejects.toThrow(NO_MODEL);
		expect(modelCalls).toBe(1);
		expect((await readWinBackRulesState(db)).note).toBeNull();
	});
});
