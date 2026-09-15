import { describe, expect, it } from "bun:test";
import {
	credentialKey,
	openSecret,
	sealSecret,
} from "../src/imap/imap-credentials";

describe("imap credentials", () => {
	const key = credentialKey("a-secret-that-is-long-enough-for-tests");

	it("round-trips a password and never stores it in clear", () => {
		const sealed = sealSecret("app-password-1234", key);

		expect(sealed.startsWith("v1.")).toBe(true);
		expect(sealed).not.toContain("app-password");
		expect(openSecret(sealed, key)).toBe("app-password-1234");
	});

	it("refuses a tampered value and a different key", () => {
		const sealed = sealSecret("hunter2", key);
		const other = credentialKey("another-secret-that-is-also-long-enough");

		const [version, iv, tag, data] = sealed.split(".");
		const flipped = data?.startsWith("A")
			? `B${data.slice(1)}`
			: `A${data?.slice(1)}`;

		expect(() =>
			openSecret([version, iv, tag, flipped].join("."), key),
		).toThrow();
		expect(() => openSecret(sealed, other)).toThrow();
		expect(() => openSecret("v0.a.b.c", key)).toThrow();
	});
});
