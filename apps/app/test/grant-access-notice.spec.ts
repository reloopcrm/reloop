import { describe, expect, it } from "bun:test";
import {
	GRANT_ACCESS,
	GRANT_ACCESS_INCOMPLETE,
	GRANT_ACCESS_INCOMPLETE_BOTH,
	grantAccessNotice,
	grantAccessReturnPath,
} from "../lib/grant-access-copy";
import { SIGN_IN_ERRORS } from "../lib/sign-in-errors";

describe("grantAccessNotice", () => {
	it("says nothing on the first visit", () => {
		expect(grantAccessNotice({ providers: ["google"] })).toBeUndefined();
	});

	it("names the error when the person cancelled the consent screen", () => {
		expect(
			grantAccessNotice({ error: "access_denied", providers: ["google"] }),
		).toEqual({ label: SIGN_IN_ERRORS.access_denied });
	});

	it("passes an unknown error code on to the person", () => {
		expect(
			grantAccessNotice({ error: "weird_code", providers: ["google"] })?.vars,
		).toEqual({ code: "weird_code" });
	});

	it("asks for both Google boxes when the person came back without them", () => {
		expect(
			grantAccessNotice({
				returned: GRANT_ACCESS.returned.value,
				providers: ["google"],
			}),
		).toEqual({ label: GRANT_ACCESS_INCOMPLETE.google });
	});

	it("asks for the mail permission when Microsoft came back without it", () => {
		expect(
			grantAccessNotice({
				returned: GRANT_ACCESS.returned.value,
				providers: ["microsoft"],
			}),
		).toEqual({ label: GRANT_ACCESS_INCOMPLETE.microsoft });
	});

	it("uses the shared text when both providers are still missing", () => {
		expect(
			grantAccessNotice({
				returned: GRANT_ACCESS.returned.value,
				providers: ["google", "microsoft"],
			}),
		).toEqual({ label: GRANT_ACCESS_INCOMPLETE_BOTH });
	});

	it("puts the error before the missing boxes", () => {
		expect(
			grantAccessNotice({
				error: "access_denied",
				returned: GRANT_ACCESS.returned.value,
				providers: ["google"],
			}),
		).toEqual({ label: SIGN_IN_ERRORS.access_denied });
	});

	it("ignores a repeated query parameter", () => {
		expect(
			grantAccessNotice({
				error: ["access_denied", "x"],
				returned: ["1", "1"],
				providers: ["google"],
			}),
		).toBeUndefined();
	});
});

describe("grantAccessReturnPath", () => {
	it("marks the return from the provider so the page can tell", () => {
		const url = new URL(grantAccessReturnPath(), "https://crm.example.com");

		expect(url.pathname).toBe("/grant-access");
		expect(url.searchParams.get(GRANT_ACCESS.returned.param)).toBe(
			GRANT_ACCESS.returned.value,
		);
	});
});
