import { afterAll, describe, expect, it, mock } from "bun:test";

const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

const invalidated: string[] = [];

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
		invalidateQueries: async ({ queryKey }: { queryKey: string[][] }) => {
			invalidated.push((queryKey[0] ?? []).join("."));
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
});
