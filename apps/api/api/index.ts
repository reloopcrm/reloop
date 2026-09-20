import "reflect-metadata";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadStoredOAuthApps } from "@crm/auth/oauth-apps";

type ExpressInstance = (req: IncomingMessage, res: ServerResponse) => void;

let instancePromise: Promise<ExpressInstance> | null = null;

function getInstance(): Promise<ExpressInstance> {
	if (!instancePromise) {
		instancePromise = (async () => {
			await loadStoredOAuthApps();
			const { createApp } = await import("../src/create-app");
			const app = await createApp();
			await app.init();
			return app.getHttpAdapter().getInstance() as ExpressInstance;
		})();
	}
	return instancePromise;
}

export default async function handler(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const instance = await getInstance();
	instance(req, res);
}
