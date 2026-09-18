import "reflect-metadata";
import { describe, expect, it } from "bun:test";
import { ImapRouter } from "../src/imap/imap.router";
import { SettingsRouter } from "../src/settings/settings.router";
import { SsoRouter } from "../src/sso/sso.router";
import { SystemRouter } from "../src/system/system.router";
import { SessionOnlyMiddleware } from "../src/trpc/middlewares/session-only.middleware";
import { WebhooksRouter } from "../src/webhooks/webhooks.router";
import { WorkspaceRouter } from "../src/workspace/workspace.router";

const MIDDLEWARES_KEY = "Symbol(trpc:middlewares_key)";

type RouterMethod = (...args: never[]) => unknown;

function middlewaresOf(handler: RouterMethod): unknown[] {
	const key = Reflect.getMetadataKeys(handler).find(
		(candidate: string | symbol) => String(candidate) === MIDDLEWARES_KEY,
	);

	return key ? ((Reflect.getMetadata(key, handler) as unknown[]) ?? []) : [];
}

describe("an API key cannot build lasting access", () => {
	const guarded = [
		["sso.register", SsoRouter.prototype.register],
		["workspace.setMemberRole", WorkspaceRouter.prototype.setMemberRole],
		["webhooks.create", WebhooksRouter.prototype.create],
		["webhooks.update", WebhooksRouter.prototype.update],
		["system.update", SystemRouter.prototype.update],
		["sso.remove", SsoRouter.prototype.remove],
		["imap.add", ImapRouter.prototype.add],
		["settings.setAgentProvider", SettingsRouter.prototype.setAgentProvider],
		[
			"settings.chatgptLoginAction",
			SettingsRouter.prototype.chatgptLoginAction,
		],
	] as const;

	for (const [name, handler] of guarded) {
		it(`refuses an API key on ${name}`, () => {
			expect(middlewaresOf(handler)).toContain(SessionOnlyMiddleware);
		});
	}
});
