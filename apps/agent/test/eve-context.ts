import type { AsyncLocalStorage } from "node:async_hooks";
import "eve/context";

type Key = { readonly name: string };

class TestContext {
	private readonly values = new Map<string, object>();

	set<T extends object>(key: Key, value: T): T {
		this.values.set(key.name, value);
		return value;
	}

	ensure<T extends object>(key: Key, initial: () => T): T {
		const current = this.values.get(key.name) as T | undefined;
		return current ?? this.set(key, initial());
	}
}

const storage: AsyncLocalStorage<TestContext> = Reflect.get(
	globalThis,
	Symbol.for("eve.context-storage"),
);

export function inEveContext<T>(run: () => Promise<T>): Promise<T> {
	return storage.run(new TestContext(), run);
}

export const researchCtx = {
	session: { auth: { current: null, initiator: null } },
} as const;
