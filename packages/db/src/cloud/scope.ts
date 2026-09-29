import type { CloudScope } from "./contract";

const SECOND_MS = 1_000;

const SELF_HOST = {
	loop: { budgetMs: 30 * SECOND_MS },
} as const;

class NoWorkspaceScope extends Error {
	constructor() {
		super(
			"A self-hosted install has one workspace and no workspace scope. Guard the call with cloud.hosted() or cloud.customer().",
		);
		this.name = "NoWorkspaceScope";
	}
}

function noScope(): never {
	throw new NoWorkspaceScope();
}

export const cloud: CloudScope = {
	loop: SELF_HOST.loop,
	hosted: () => false,
	customer: () => false,
	operatorId: () => null,
	scopeId: () => null,
	current: noScope,
	addOns: noScope,
	scopedKey: (key) => key,
	hold: (fn) => fn(),
	run: (_scope, fn) => fn(),
	byId: async () => null,
	activeBySite: async () => null,
	active: async () => [],
	forEachScope: (fn) => fn(new AbortController().signal),
	resolveClient: (single) => single(),
	disconnectClients: async () => {},
	ping: async () => {},
	close: async () => {},
	onMemberAdded: async () => {},
	onMemberRemoved: async () => {},
};
