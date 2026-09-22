import { AsyncLocalStorage } from "node:async_hooks";
import { canonicalPlanId } from "@crm/db/plans";
import type { LanguageModel, LanguageModelMiddleware } from "ai";
import { wrapLanguageModel } from "ai";
import { z } from "zod";
import { DISPATCH } from "./dispatch-config";

export type Lane = "fast" | "slow";

type ModelObject = Exclude<LanguageModel, string>;

type Bucket = { tokens: number; cap: number; at: number };

const MINUTE_MS = 60_000;

const perMinuteEnv = z.coerce
	.number()
	.int()
	.min(1)
	.catch(DISPATCH.bucket.perMinute);

export function perMinuteFrom(env: NodeJS.ProcessEnv = process.env): number {
	return perMinuteEnv.parse(env[DISPATCH.bucket.envVar] ?? "");
}

export function slowShareOf(plan: string | null | undefined): number {
	const id = canonicalPlanId(plan);
	const byPlan: Record<string, number> = DISPATCH.bucket.share.byPlan;
	return (id && byPlan[id]) ?? DISPATCH.bucket.share.other;
}

const lanes = new AsyncLocalStorage<Lane>();

export function currentLane(): Lane {
	return lanes.getStore() ?? "fast";
}

export function inLane<T>(lane: Lane, fn: () => Promise<T>): Promise<T> {
	return lanes.run(lane, fn);
}

export class KeyBucket {
	private readonly global: Bucket;
	private readonly tenants = new Map<string, Bucket>();
	private readonly perMinute: number;

	constructor(
		perMinute: number,
		private readonly now: () => number = Date.now,
	) {
		this.perMinute = perMinute;
		this.global = { tokens: perMinute, cap: perMinute, at: now() };
	}

	private refill(bucket: Bucket): Bucket {
		const at = this.now();
		const gained = ((at - bucket.at) / MINUTE_MS) * bucket.cap;
		bucket.tokens = Math.min(bucket.cap, bucket.tokens + gained);
		bucket.at = at;
		return bucket;
	}

	private tenant(tenantId: string, plan: string | null): Bucket {
		const cap = Math.max(
			1,
			this.perMinute * (1 - DISPATCH.bucket.fastReserve) * slowShareOf(plan),
		);
		const existing = this.tenants.get(tenantId);
		if (existing) {
			existing.cap = cap;
			return this.refill(existing);
		}
		const bucket = { tokens: cap, cap, at: this.now() };
		this.tenants.set(tenantId, bucket);
		return bucket;
	}

	slowAllowance(tenantId: string | null, plan: string | null): number {
		const global = this.refill(this.global);
		const reserve = global.cap * DISPATCH.bucket.fastReserve;
		const beyondReserve = Math.floor(global.tokens - reserve);
		if (tenantId === null) return Math.max(0, beyondReserve);

		const own = Math.floor(this.tenant(tenantId, plan).tokens);
		return Math.max(0, Math.min(beyondReserve, own));
	}

	take(lane: Lane, tenantId: string | null, plan: string | null): number {
		const global = this.refill(this.global);
		const floor =
			lane === "fast" ? 0 : global.cap * DISPATCH.bucket.fastReserve;
		const room = global.tokens - floor;
		global.tokens -= 1;

		if (lane === "slow" && tenantId !== null) {
			const own = this.tenant(tenantId, plan);
			own.tokens -= 1;
			if (own.tokens < 0) return this.waitFor(own, 0);
		}

		return room >= 1 ? 0 : this.waitFor(global, floor);
	}

	private waitFor(bucket: Bucket, floor: number): number {
		const missing = floor + 1 - bucket.tokens;
		const ms = (missing / bucket.cap) * MINUTE_MS;
		return Math.min(Math.max(0, Math.ceil(ms)), DISPATCH.bucket.waitMaxMs);
	}
}

let shared: KeyBucket | null = null;

export function keyBucket(): KeyBucket {
	shared ??= new KeyBucket(perMinuteFrom());
	return shared;
}

export function resetKeyBucket(bucket: KeyBucket | null = null): void {
	shared = bucket;
}

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

export function withKeyBucket(
	model: ModelObject,
	tenant: () => { id: string | null; plan: string | null },
	bucket: () => KeyBucket = keyBucket,
): ModelObject {
	const wait = async () => {
		const who = tenant();
		const ms = bucket().take(currentLane(), who.id, who.plan);
		if (ms > 0) await sleep(ms);
	};

	const middleware: LanguageModelMiddleware = {
		wrapGenerate: async ({ doGenerate }) => {
			await wait();
			return doGenerate();
		},
		wrapStream: async ({ doStream }) => {
			await wait();
			return doStream();
		},
	};

	return wrapLanguageModel({ model, middleware }) as ModelObject;
}
