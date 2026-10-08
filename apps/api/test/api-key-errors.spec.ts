import { describe, expect, it, spyOn } from "bun:test";
import { auth } from "@crm/auth";
import type { Db } from "@crm/db";
import { HttpException } from "@nestjs/common";
import { APIError } from "better-auth/api";
import { ApiKeysService } from "../src/api-keys/api-keys.service";

const service = new ApiKeysService(undefined as unknown as Db);
const headers = new Headers();

async function revokeFailure(error: APIError): Promise<HttpException> {
	const spy = spyOn(auth.api, "deleteApiKey").mockRejectedValue(error);

	try {
		await service.revoke("user", headers, { id: "key" });
	} catch (thrown) {
		if (thrown instanceof HttpException) return thrown;
		throw thrown;
	} finally {
		spy.mockRestore();
	}

	throw new Error("revoke did not fail");
}

async function createFailure(error: APIError): Promise<HttpException> {
	const spy = spyOn(auth.api, "createApiKey").mockRejectedValue(error);

	try {
		await service.create("user", headers, {
			name: "Preview",
			expiresInDays: 90,
		});
	} catch (thrown) {
		if (thrown instanceof HttpException) return thrown;
		throw thrown;
	} finally {
		spy.mockRestore();
	}

	throw new Error("create did not fail");
}

describe("an API key call that better-auth refuses", () => {
	it("says in our words that the key is gone", async () => {
		const failure = await revokeFailure(
			new APIError("NOT_FOUND", {
				code: "KEY_NOT_FOUND",
				message: "API Key not found",
			}),
		);

		expect(failure.message).toBe(
			"That API key no longer exists. Reload the page.",
		);
		expect(failure.getStatus()).toBe(404);
	});

	it("says in our words that the expiry is out of range", async () => {
		const failure = await createFailure(
			new APIError("BAD_REQUEST", {
				code: "EXPIRES_IN_IS_TOO_LARGE",
				message: "The expiresIn is larger than the predefined maximum value.",
			}),
		);

		expect(failure.message).toBe("Pick one of the expiry options for the key.");
		expect(failure.getStatus()).toBe(400);
	});

	it("never shows a vendor sentence it does not know", async () => {
		const failure = await createFailure(
			new APIError("BAD_REQUEST", {
				code: "METADATA_DISABLED",
				message: "Metadata is disabled.",
			}),
		);

		expect(failure.message).toBe("The API key could not be saved.");
		expect(failure.getStatus()).toBe(400);
	});

	it("keeps the sentence the access guard wrote", async () => {
		const failure = await createFailure(
			new APIError("UNAUTHORIZED", {
				message: "An API key cannot manage API keys. Sign in to the CRM first.",
			}),
		);

		expect(failure.message).toBe(
			"An API key cannot manage API keys. Sign in to the CRM first.",
		);
		expect(failure.getStatus()).toBe(401);
	});
});
