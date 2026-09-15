import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const api = resolve(root, "apps/api");
const env = {
	...process.env,
	NODE_ENV: "test",
	DATABASE_URL: "postgresql://test:test@127.0.0.1:1/crm_test",
	TEST_DATABASE_URL: "postgresql://test:test@127.0.0.1:1/crm_test",
	BETTER_AUTH_SECRET: "isolated-test-secret-at-least-thirty-two-characters",
	ALLOWED_SIGN_IN: "example.com",
	PASSWORD_SIGN_IN: "1",
	CRM_TELEMETRY_DISABLED: "1",
	AGENT_BRIDGE_SECRET: "",
	MAILBOX_SYNC_INTERVAL_MS: "0",
	REDIS_URL: "",
};

async function run(args: string[], cwd = root) {
	const child = Bun.spawn([process.execPath, ...args], {
		cwd,
		env,
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await child.exited;
	if (code !== 0) process.exit(code);
}

await run(["run", "build"], api);
await run([
	"test",
	"--preload",
	"./apps/api/test/classic-decorators.ts",
	"apps/api/test/settings-security.spec.ts",
	"apps/api/test/imap-security.spec.ts",
	"apps/api/test/imap-credentials.spec.ts",
	"apps/api/test/access-security.spec.ts",
	"apps/api/test/decorators.spec.ts",
	"packages/db/test/context-secret.spec.ts",
	"packages/db/test/network-security.spec.ts",
	"packages/db/test/plans.spec.ts",
	"packages/db/test/model-spend.spec.ts",
	"packages/db/test/test-db-safety.spec.ts",
	"packages/auth/test/access-guard.spec.ts",
	"packages/auth/test/password-security.spec.ts",
	"apps/app/test/german-dictionary.spec.ts",
	"apps/api/test/dev-restart.spec.ts",
]);
await run([
	"test",
	"--preload",
	"./apps/api/test/classic-decorators.ts",
	"apps/api/test/startup-security.spec.ts",
	"apps/api/test/built-startup.spec.ts",
]);
await run(["test", "apps/app/test/email-draft-security.spec.tsx"]);
