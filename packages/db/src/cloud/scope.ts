import { CLOUD } from "./cloud-config";
import type { CloudScope } from "./contract";

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
	loop: CLOUD.selfHost.loop,
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
