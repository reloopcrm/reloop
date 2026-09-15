import { mock, spyOn } from "bun:test";

const database = await import("@crm/db");
mock.module("@crm/db", () => ({
	...database,
	db: {
		$connect: async () => {},
		$disconnect: async () => {},
		$queryRaw: async () => [{ value: 1 }],
	},
}));

const denyNetwork = () => {
	throw new Error("Provider access is disabled in the startup test");
};
spyOn(globalThis, "fetch").mockImplementation(
	Object.assign(denyNetwork, { preconnect: denyNetwork }),
);
