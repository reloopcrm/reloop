import { describe, expect, it } from "bun:test";
import {
	updateNowShape,
	versionCardShape,
} from "../app/(app)/[slug]/settings/version";
import { managedInstall } from "../lib/operator";

describe("the version card", () => {
	it("shows the update button only with an update and a reachable updater", () => {
		expect(
			versionCardShape({
				managed: false,
				updateAvailable: true,
				updaterAvailable: true,
			}),
		).toBe("updater");
		expect(
			versionCardShape({
				managed: false,
				updateAvailable: true,
				updaterAvailable: false,
			}),
		).toBe("command");
		expect(
			versionCardShape({
				managed: false,
				updateAvailable: false,
				updaterAvailable: true,
			}),
		).toBe("command");
	});

	it("shows neither the command nor the button on a managed install", () => {
		expect(
			versionCardShape({
				managed: true,
				updateAvailable: true,
				updaterAvailable: true,
			}),
		).toBe("managed");
	});

	it("counts only a started update and a pending call as restarting", () => {
		expect(
			updateNowShape({ pending: false, error: false, status: "started" }),
		).toBe("restarting");
		expect(updateNowShape({ pending: true, error: false, status: null })).toBe(
			"restarting",
		);
		expect(
			updateNowShape({ pending: false, error: false, status: "refused" }),
		).toBe("notStarted");
		expect(
			updateNowShape({ pending: false, error: false, status: "unavailable" }),
		).toBe("notStarted");
		expect(updateNowShape({ pending: false, error: true, status: null })).toBe(
			"notStarted",
		);
		expect(updateNowShape({ pending: false, error: false, status: null })).toBe(
			"idle",
		);
	});

	it("reads only the literal true", () => {
		const real = process.env.RELOOP_MANAGED;
		try {
			process.env.RELOOP_MANAGED = "true";
			expect(managedInstall()).toBe(true);
			process.env.RELOOP_MANAGED = "1";
			expect(managedInstall()).toBe(false);
			delete process.env.RELOOP_MANAGED;
			expect(managedInstall()).toBe(false);
		} finally {
			if (real === undefined) delete process.env.RELOOP_MANAGED;
			else process.env.RELOOP_MANAGED = real;
		}
	});
});
