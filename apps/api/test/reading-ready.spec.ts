import { describe, expect, it } from "bun:test";
import { readingReady } from "../src/reactivation/reading-ready";

const none = {
	openrouterKey: null,
	openaiKey: null,
	anthropicKey: null,
};
const key = { OPENROUTER_API_KEY: "preview-key" };

describe("readingReady", () => {
	it("is false without any model provider", () => {
		expect(
			readingReady({
				fixed: false,
				setting: none,
				chatgptUsable: false,
				functions: {},
				env: {},
			}),
		).toBe(false);
	});

	it("is true with a stored key", () => {
		expect(
			readingReady({
				fixed: false,
				setting: { ...none, openaiKey: "sealed" },
				chatgptUsable: false,
				functions: {},
				env: {},
			}),
		).toBe(true);
	});

	it("is true with the environment key", () => {
		expect(
			readingReady({
				fixed: false,
				setting: none,
				chatgptUsable: false,
				functions: {},
				env: key,
			}),
		).toBe(true);
	});

	it("is true with a usable ChatGPT login and no key", () => {
		expect(
			readingReady({
				fixed: false,
				setting: none,
				chatgptUsable: true,
				functions: {},
				env: {},
			}),
		).toBe(true);
	});

	it("is false when the conversation reading is switched off", () => {
		expect(
			readingReady({
				fixed: false,
				setting: none,
				chatgptUsable: false,
				functions: { "thread-insight": false },
				env: key,
			}),
		).toBe(false);
	});

	it("needs the environment key for the included AI", () => {
		expect(
			readingReady({
				fixed: true,
				setting: none,
				chatgptUsable: false,
				functions: {},
				env: {},
			}),
		).toBe(false);
		expect(
			readingReady({
				fixed: true,
				setting: none,
				chatgptUsable: false,
				functions: {},
				env: key,
			}),
		).toBe(true);
	});
});
