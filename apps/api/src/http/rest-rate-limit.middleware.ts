import { createHash } from "node:crypto";
import { API_KEY_HEADER } from "@crm/auth";
import { type Db, db } from "@crm/db";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
	REQUEST_SIZE,
	REST_RATE_LIMIT,
	type RestRateLimitWindow,
} from "./http-config";

type WindowRow = { count: number; windowStart: bigint };

export type RestRateLimitDecision = {
	allowed: boolean;
	retryAfterSeconds: number;
};

function keyHeaderOf(req: Request): string | null {
	const value = req.headers[API_KEY_HEADER];
	const header = Array.isArray(value) ? value[0] : value;

	return header ? header : null;
}

export function storeKeyOf(apiKeyId: string): string {
	return `${REST_RATE_LIMIT.storeKeyPrefix}${apiKeyId}`;
}

async function apiKeyIdOf(
	client: Pick<Db, "apikey">,
	apiKey: string,
): Promise<string | null> {
	const hashed = createHash("sha256").update(apiKey).digest("base64url");
	const row = await client.apikey.findFirst({
		where: { key: hashed },
		select: { id: true },
	});

	return row?.id ?? null;
}

export async function countRestRequest(
	client: Pick<Db, "$queryRaw" | "$executeRaw">,
	storeKey: string,
	limit: RestRateLimitWindow,
	now: number,
): Promise<RestRateLimitDecision> {
	const rows = await client.$queryRaw<WindowRow[]>`
		INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest")
		VALUES (${storeKey}, ${storeKey}, 1, ${now})
		ON CONFLICT ("key") DO UPDATE SET
			"count" = CASE
				WHEN "rateLimit"."lastRequest" <= ${now - limit.windowMs} THEN 1
				ELSE "rateLimit"."count" + 1
			END,
			"lastRequest" = CASE
				WHEN "rateLimit"."lastRequest" <= ${now - limit.windowMs} THEN ${now}
				ELSE "rateLimit"."lastRequest"
			END
		RETURNING "count", "lastRequest" AS "windowStart"
	`;
	const row = rows[0];

	if (!row || row.count <= limit.max) {
		return { allowed: true, retryAfterSeconds: 0 };
	}

	const remainingMs = Number(row.windowStart) + limit.windowMs - now;

	return {
		allowed: false,
		retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000)),
	};
}

async function pruneExpired(
	client: Pick<Db, "$executeRaw">,
	limit: RestRateLimitWindow,
	now: number,
): Promise<void> {
	await client.$executeRaw`
		DELETE FROM "rateLimit"
		WHERE "key" LIKE ${`${REST_RATE_LIMIT.storeKeyPrefix}%`}
			AND "lastRequest" <= ${now - limit.windowMs}
	`;
}

export function restRateLimit(
	limit: RestRateLimitWindow = REST_RATE_LIMIT.apiKey,
	client: Pick<Db, "$queryRaw" | "$executeRaw" | "apikey"> = db,
): RequestHandler {
	let prunedAt = 0;

	return (req: Request, res: Response, next: NextFunction): void => {
		const apiKey = keyHeaderOf(req);

		if (!apiKey) {
			next();
			return;
		}

		const now = Date.now();
		const due = now - prunedAt >= limit.windowMs;

		if (due) prunedAt = now;

		const prune = due ? pruneExpired(client, limit, now) : Promise.resolve();

		prune
			.then(() => apiKeyIdOf(client, apiKey))
			.then((apiKeyId) =>
				apiKeyId
					? countRestRequest(client, storeKeyOf(apiKeyId), limit, now)
					: { allowed: true, retryAfterSeconds: 0 },
			)
			.then((decision) => {
				if (decision.allowed) {
					next();
					return;
				}

				let answered = false;
				const refuse = (): void => {
					if (answered) return;
					answered = true;
					res
						.status(429)
						.set(
							REST_RATE_LIMIT.retryAfterHeader,
							String(decision.retryAfterSeconds),
						)
						.json({
							message: REST_RATE_LIMIT.message,
							code: "TOO_MANY_REQUESTS",
						});
				};

				if (req.readableEnded) {
					refuse();
					return;
				}

				let received = 0;
				req.on("data", (chunk: Buffer) => {
					received += chunk.length;

					if (received > REQUEST_SIZE.body.maxBytes) {
						req.pause();
						res.once("finish", () => req.socket.destroy());
						refuse();
					}
				});
				req.once("end", refuse);
				req.resume();
			})
			.catch(next);
	};
}
