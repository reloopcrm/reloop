import { afterAll, describe, expect, it, mock } from "bun:test";

const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

const invalidated: string[] = [];
const quiet: string[] = [];

function procedures(path: string[] = []): unknown {
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
	it("refreshes the Win back list, because a reminder task hides a person", async () => {
		invalidated.length = 0;
		await useCrmCache().activity();

		expect(invalidated).toContain("reactivation.list");
		expect(invalidated).toContain("activities.myTasks");
	});

	it("marks every Continue with as outdated without moving the open page", async () => {
		quiet.length = 0;
		invalidated.length = 0;
		await useCrmCache().activity();

		expect(quiet).toContain("reactivation.nextPerson");
		expect(invalidated).not.toContain("reactivation.nextPerson");
	});
});
