import { describe, expect, it } from "bun:test";
import {
	OWNER_STATE,
	ownerState,
	passwordFromStdin,
	planOwner,
} from "../scripts/create-owner";
import { WIN_BACK } from "../src/reactivation/reactivation.config";
import { MAILBOX_SYNC, selfHostTimers } from "../src/sync/sync.config";

const allowed = (email: string) => email === "owner@example.com";

describe("create-owner", () => {
	it("creates an allowed owner that does not exist", () => {
		expect(
			planOwner({
				email: " Owner@Example.com ",
				allowed,
				existingUserId: null,
			}),
		).toEqual({ action: "create", email: "owner@example.com", name: "owner" });
	});

	it("only sets the password for an existing user", () => {
		expect(
			planOwner({ email: "owner@example.com", allowed, existingUserId: "u1" }),
		).toEqual({
			action: "set-password",
			email: "owner@example.com",
			userId: "u1",
		});
	});

	it("refuses an address outside ALLOWED_SIGN_IN", () => {
		expect(
			planOwner({ email: "x@other.com", allowed, existingUserId: "u1" }).action,
		).toBe("refuse");
	});

	it("refuses a missing or malformed address", () => {
		for (const email of [undefined, "", "nobody", "a@b@c"]) {
			expect(planOwner({ email, allowed, existingUserId: null }).action).toBe(
				"refuse",
			);
		}
	});

	it("reports whether any account exists, so install.sh can decide", () => {
		expect(ownerState(0)).toBe(OWNER_STATE.none);
		expect(ownerState(1)).toBe(OWNER_STATE.exists);
		expect(OWNER_STATE.none).not.toContain(OWNER_STATE.exists);
	});

	it("drops one trailing newline from the piped password", () => {
		expect(passwordFromStdin("secret pass \n")).toBe("secret pass ");
		expect(passwordFromStdin("secret\r\n")).toBe("secret");
		expect(passwordFromStdin("secret")).toBe("secret");
	});
});

describe("self-host timers", () => {
	it("runs nothing on Vercel", () => {
		expect(
			selfHostTimers({
				vercel: "1",
				nodeEnv: "production",
				mailboxIntervalMs: 60_000,
			}),
		).toEqual({
			mailboxEveryMs: null,
			ratesEveryMs: null,
			winBackEveryMs: null,
		});
	});

	it("runs both timers in production off Vercel", () => {
		expect(
			selfHostTimers({
				vercel: undefined,
				nodeEnv: "production",
				mailboxIntervalMs: 300_000,
			}),
		).toEqual({
			mailboxEveryMs: 300_000,
			ratesEveryMs: MAILBOX_SYNC.rates.everyMs,
			winBackEveryMs: WIN_BACK.followUp.everyMs,
		});
	});

	it("keeps the mailbox timer off when the interval is unset or zero", () => {
		for (const mailboxIntervalMs of [undefined, 0]) {
			expect(
				selfHostTimers({
					vercel: undefined,
					nodeEnv: "production",
					mailboxIntervalMs,
				}).mailboxEveryMs,
			).toBeNull();
		}
	});

	it("raises a tiny interval to the minimum", () => {
		expect(
			selfHostTimers({
				vercel: undefined,
				nodeEnv: "development",
				mailboxIntervalMs: 1,
			}),
		).toEqual({
			mailboxEveryMs: MAILBOX_SYNC.heartbeat.minIntervalMs,
			ratesEveryMs: null,
			winBackEveryMs: null,
		});
	});
});
