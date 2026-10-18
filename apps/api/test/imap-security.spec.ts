import { afterEach, describe, expect, it, spyOn } from "bun:test";
import dns from "node:dns/promises";
import { ImapFlow } from "imapflow";
import { ImapClientFactory } from "../src/imap/imap.client";

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

const settings = {
	host: "mail.example",
	port: 143,
	secure: false,
	username: "test",
	password: "test-password",
};

describe("IMAP transport security", () => {
	it("requires STARTTLS and pins the public address before authentication", async () => {
		spies.push(
			spyOn(dns, "lookup").mockResolvedValue([
				{ address: "8.8.8.8", family: 4 },
			] as never),
		);
		let options: unknown;
		spies.push(
			spyOn(ImapFlow.prototype, "connect").mockImplementation(async function (
				this: ImapFlow,
			) {
				options = (this as unknown as { options: unknown }).options;
			}),
		);
		expect((await new ImapClientFactory().connect(settings)).outcome).toBe(
			"ok",
		);
		expect(options).toMatchObject({
			host: "8.8.8.8",
			servername: "mail.example",
			doSTARTTLS: true,
			secure: false,
		});
	});
	it("rejects private servers before attempting authentication", async () => {
		const connect = spyOn(ImapFlow.prototype, "connect");
		spies.push(connect);
		expect(
			(
				await new ImapClientFactory().connect({
					...settings,
					host: "127.0.0.1",
				})
			).outcome,
		).toBe("unreachable");
		expect(connect).not.toHaveBeenCalled();
	});
});

it("contains malformed IMAP error events", async () => {
	spies.push(
		spyOn(dns, "lookup").mockResolvedValue([
			{ address: "8.8.8.8", family: 4 },
		] as never),
	);
	spies.push(
		spyOn(ImapFlow.prototype, "connect").mockImplementation(async function (
			this: ImapFlow,
		) {
			this.emit("error", null);
			throw { message: 42, responseText: null };
		}),
	);
	spies.push(spyOn(ImapFlow.prototype, "close").mockImplementation(() => {}));
	expect((await new ImapClientFactory().connect(settings)).outcome).toBe(
		"failed",
	);
});

it("uses TLS directly for secure IMAP", async () => {
	let options: unknown;
	spies.push(
		spyOn(ImapFlow.prototype, "connect").mockImplementation(async function (
			this: ImapFlow,
		) {
			options = (this as unknown as { options: unknown }).options;
		}),
	);
	expect(
		(
			await new ImapClientFactory().connect({
				...settings,
				host: "8.8.8.8",
				secure: true,
				port: 993,
			})
		).outcome,
	).toBe("ok");
	expect(options).toMatchObject({ secure: true, servername: "8.8.8.8" });
});
