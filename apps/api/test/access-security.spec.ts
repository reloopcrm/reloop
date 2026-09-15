import { afterEach, describe, expect, it, mock } from "bun:test";
import { API_KEY_HEADER } from "@crm/auth";
import { CONTACT_LIMIT_MESSAGE } from "@crm/db/plans";
import type { MiddlewareOptions } from "nestjs-trpc";
import { AuthMiddleware } from "../src/trpc/middlewares/auth.middleware";
import { DomainErrorMiddleware } from "../src/trpc/middlewares/domain-error.middleware";
import { SessionOnlyMiddleware } from "../src/trpc/middlewares/session-only.middleware";

const allowed = process.env.ALLOWED_SIGN_IN;
afterEach(() => {
	if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
	else process.env.ALLOWED_SIGN_IN = allowed;
});

describe("authentication boundaries", () => {
	it("rejects an existing session after its address loses access", async () => {
		process.env.ALLOWED_SIGN_IN = "allowed.example";
		const next = mock(async () => ({ ok: true }));
		const options = {
			ctx: { session: { user: { id: "test", email: "rep@allowed.example" } } },
			next,
		} as unknown as MiddlewareOptions;
		await new AuthMiddleware().use(options);
		process.env.ALLOWED_SIGN_IN = "different.example";
		await expect(new AuthMiddleware().use(options)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(next).toHaveBeenCalledTimes(1);
	});
	it("refuses an API key even with a session cookie", async () => {
		const next = mock(async () => ({ ok: true }));
		const options = {
			ctx: {
				req: {
					headers: { [API_KEY_HEADER]: "test-key", cookie: "test-cookie" },
				},
			},
			next,
		} as unknown as MiddlewareOptions;
		await expect(
			new SessionOnlyMiddleware().use(options),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(next).not.toHaveBeenCalled();
	});
	it("returns the same contact limit error through the shared API middleware", async () => {
		const options = {
			next: async () => ({
				ok: false,
				error: {
					cause: new Error(`Database constraint: ${CONTACT_LIMIT_MESSAGE}`),
				},
			}),
		} as unknown as MiddlewareOptions;
		await expect(
			new DomainErrorMiddleware().use(options),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: CONTACT_LIMIT_MESSAGE,
		});
	});
});
