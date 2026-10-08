import { afterAll, describe, expect, it, mock } from "bun:test";

const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

const invalidated: string[] = [];
const quiet: string[] = [];

function procedures(path: string[] = []) {
	return new Proxy(() => {}, {
		get(_target, key) {
			if (key === "queryKey" || key === "pathKey") {
				return () => [path];
			}
			return procedures([...path, String(key)]);
		},
	});
}

mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => procedures(),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useQueryClient: () => ({
		invalidateQueries: async ({
			queryKey,
			refetchType,
		}: {
			queryKey: string[][];
			refetchType?: string;
		}) => {
			const name = (queryKey[0] ?? []).join(".");
			if (refetchType === "none") quiet.push(name);
			else invalidated.push(name);
		},
	}),
}));

const { useCrmCache } = await import("../lib/trpc/cache");

afterAll(() => {
	mock.restore();
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
});

describe("a changed activity", () => {
	it("leaves the Win back list alone for a note, a call or a plain task", async () => {
		quiet.length = 0;
		invalidated.length = 0;
		await useCrmCache().activity();

		expect(invalidated).toContain("activities.myTasks");
		expect(invalidated).not.toContain("reactivation.list");
		expect(invalidated).not.toContain("reactivation.person");
		expect(quiet).not.toContain("reactivation.nextPerson");
	});

	it("refreshes the Win back list when a reminder hides or shows a person", async () => {
		invalidated.length = 0;
		await useCrmCache().activity({ winBack: true });

		expect(invalidated).toContain("reactivation.list");
		expect(invalidated).toContain("reactivation.person");
		expect(invalidated).toContain("activities.myTasks");
	});

	it("marks every Continue with as outdated without moving the open page", async () => {
		quiet.length = 0;
		invalidated.length = 0;
		await useCrmCache().activity({ winBack: true });

		expect(quiet).toContain("reactivation.nextPerson");
		expect(invalidated).not.toContain("reactivation.nextPerson");
	});
});
