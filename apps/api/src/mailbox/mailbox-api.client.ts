import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { PROVIDER_API } from "./mailbox.config";

export type MailboxResult<T> =
	| { outcome: "ok"; data: T }
	| { outcome: "cursor-invalid"; reason: string }
	| { outcome: "unauthorized"; reason: string }
	| { outcome: "rate-limited"; reason: string; retryAfterMs: number }
	| { outcome: "unreadable"; reason: string }
	| { outcome: "failed"; reason: string; retryable: boolean };

const providerErrorBody = z.object({
	error: z
		.object({
			message: z.string().optional(),
			status: z.string().optional(),
			code: z.union([z.string(), z.number()]).transform(String).optional(),
		})
		.optional(),
});

@Injectable()
export class MailboxApiClient {
	private readonly logger = new Logger(MailboxApiClient.name);

	async get<T>(
		url: string,
		accessToken: string,
		schema: z.ZodType<T>,
		params: Record<string, string | number | boolean | undefined> = {},
	): Promise<MailboxResult<T>> {
		const target = new URL(url);
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) target.searchParams.set(key, String(value));
		}

		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			PROVIDER_API.timeoutMs,
		);

		try {
			const response = await fetch(target, {
				headers: { authorization: `Bearer ${accessToken}` },
				signal: controller.signal,
			});

			return await this.interpret(response, target.pathname, schema);
		} catch (error) {
			const aborted = error instanceof Error && error.name === "AbortError";
			return {
				outcome: "failed",
				reason: aborted
					? `Timed out after ${PROVIDER_API.timeoutMs}ms.`
					: error instanceof Error
						? error.message
						: String(error),
				retryable: true,
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	private async interpret<T>(
		response: Response,
		path: string,
		schema: z.ZodType<T>,
	): Promise<MailboxResult<T>> {
		if (response.ok) {
			const parsed = schema.safeParse(await response.json());
			if (parsed.success) return { outcome: "ok", data: parsed.data };

			const issues = parsed.error.issues
				.map((issue) => `${issue.path.join(".") || "body"} ${issue.message}`)
				.join("; ");
			this.logger.warn({
				message: "Mailbox API response did not match its schema",
				path,
				issues,
			});
			return {
				outcome: "unreadable",
				reason: `Unreadable response from ${path}: ${issues}`,
			};
		}

		const detail = await this.reason(response);

		switch (response.status) {
			case 401:
				return { outcome: "unauthorized", reason: detail };

			case 404:
			case 410:
				return { outcome: "cursor-invalid", reason: detail };

			case 403:
				if (/rate|quota|userRateLimitExceeded|limitExceeded/i.test(detail)) {
					return {
						outcome: "rate-limited",
						reason: detail,
						retryAfterMs: this.backoffFrom(response),
					};
				}
				return { outcome: "failed", reason: detail, retryable: false };

			case 429:
				return {
					outcome: "rate-limited",
					reason: detail,
					retryAfterMs: this.backoffFrom(response),
				};

			default: {
				const retryable = response.status >= 500;
				this.logger.warn({
					message: "Mailbox API call failed",
					path,
					status: response.status,
					retryable,
				});
				return { outcome: "failed", reason: detail, retryable };
			}
		}
	}

	private backoffFrom(response: Response): number {
		const header = response.headers.get("retry-after");
		const seconds = header ? Number(header) : Number.NaN;
		const suggested = Number.isFinite(seconds)
			? seconds * 1000
			: PROVIDER_API.minBackoffMs;

		return Math.min(
			Math.max(suggested, PROVIDER_API.minBackoffMs),
			PROVIDER_API.maxBackoffMs,
		);
	}

	private async reason(response: Response): Promise<string> {
		try {
			const body = providerErrorBody.safeParse(await response.json());
			const error = body.success ? body.data.error : undefined;
			return (
				error?.message ??
				error?.status ??
				error?.code ??
				`HTTP ${response.status}`
			);
		} catch {
			return `HTTP ${response.status}`;
		}
	}
}
