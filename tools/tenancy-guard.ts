import { readFileSync } from "node:fs";

type Rule = {
	name: string;
	pattern: RegExp;
	scope?: RegExp;
	allowed: readonly string[];
	skipTests: boolean;
	why: string;
};

const APP = /^apps\/app\//;

const APP_TENANT_WRAPPERS = [
	"apps/app/lib/session.ts",
	"apps/app/lib/mailbox-connection.ts",
	"apps/app/app/eve/v1/[...path]/route.ts",
];

const DB_READING_AUTH_EXPORTS = [
	"auth",
	"ensureWorkspaceMembership",
	"workspaceRoleOf",
	"hasPassword",
	"setPasswordFor",
	"writeCredentialAccount",
	"grantSignIn",
	"isSignInAllowed",
	"readSignInGrants",
	"revokeSignIn",
];

const DB_READING_DB_MODULES = [
	"contact-attention",
	"fx",
	"model-spend",
	"plan-usage",
	"provider-usage",
	"reactivation",
	"settings",
	"slack-inventory",
	"win-back-outcome",
];

const CLOUD_SIDE = [
	"packages/db/src/cloud/",
	"apps/api/src/cloud/",
	"apps/app/cloud/",
	"packages/auth/src/cloud/",
];

const namedImport = (names: readonly string[], from: string) =>
	new RegExp(
		`import\\s*(type\\s+)?\\{[^}]*\\b(${names.join("|")})\\b[^}]*\\}\\s*from\\s*"${from}"`,
	);

const RULES: readonly Rule[] = [
	{
		name: "new PrismaClient / new PrismaPg",
		pattern: /new Prisma(Client|Pg)\(/,
		allowed: ["packages/db/src/client.ts"],
		skipTests: false,
		why: "Every client comes from packages/db/src/client.ts, which asks the cloud port for the workspace client.",
	},
	{
		name: "process.env.ALLOWED_SIGN_IN",
		pattern: /(?<!delete )process\.env\.ALLOWED_SIGN_IN(?!\s*=[^=])/,
		allowed: ["packages/auth/src/workspace.ts"],
		skipTests: true,
		why: "The allow-list is read through allowList() in packages/auth/src/workspace.ts, which asks the cloud port first.",
	},
	{
		name: "db from @crm/db in apps/app",
		pattern: namedImport(["db"], "@crm/db"),
		scope: APP,
		allowed: APP_TENANT_WRAPPERS,
		skipTests: true,
		why: "The app renders outside any workspace scope. Read through a cache()d helper in apps/app/lib/session.ts that wraps inScope() from apps/app/cloud/scope.server.ts.",
	},
	{
		name: "a db-reading @crm/auth helper in apps/app",
		pattern: namedImport(DB_READING_AUTH_EXPORTS, "@crm/auth"),
		scope: APP,
		allowed: ["apps/app/lib/session.ts"],
		skipTests: true,
		why: "These helpers read db. The app wraps them in inScope() inside apps/app/lib/session.ts. The list mirrors the exports of packages/auth/src files that import @crm/db.",
	},
	{
		name: "a db-reading @crm/db module in apps/app",
		pattern: new RegExp(
			`from\\s*"@crm/db/(${DB_READING_DB_MODULES.join("|")})"`,
		),
		scope: APP,
		allowed: APP_TENANT_WRAPPERS,
		skipTests: true,
		why: "These modules read db. Load them through an inScope() helper in apps/app/lib. The list is every packages/db/src module that imports ./client, except tracking and workspace, whose app imports are constants.",
	},
	{
		name: "a cloud module other than the port imported by the core",
		pattern:
			/(from\s*|import\(\s*)"@crm\/db\/cloud\/(?!scope"|contract")[^"]+"/,
		allowed: CLOUD_SIDE,
		skipTests: true,
		why: "Core code reaches the hosted Cloud through the port, cloud.* from @crm/db/cloud/scope, typed by @crm/db/cloud/contract. Only the slots import anything else under @crm/db/cloud.",
	},
];

const SELF = "tools/tenancy-guard.ts";
const TEST_FILE = /(^|\/)(test|tests)\/|\.spec\.tsx?$/;
const SKIPPED = /(^|\/)(generated|node_modules|dist|\.next)\//;

const files = new TextDecoder()
	.decode(
		Bun.spawnSync(["git", "ls-files", "-z", "*.ts", "*.tsx", "*.mjs", "*.js"])
			.stdout,
	)
	.split("\0")
	.filter((file) => file && file !== SELF && !SKIPPED.test(file));

function allows(entry: string, file: string): boolean {
	return entry.endsWith("/") ? file.startsWith(entry) : entry === file;
}

const violations: string[] = [];

for (const file of files) {
	const source = readFileSync(file, "utf8");
	for (const rule of RULES) {
		if (rule.scope && !rule.scope.test(file)) continue;
		if (rule.allowed.some((entry) => allows(entry, file))) continue;
		if (rule.skipTests && TEST_FILE.test(file)) continue;
		if (rule.scope) {
			if (rule.pattern.test(source)) {
				violations.push(`${file}  ${rule.name}. ${rule.why}`);
			}
			continue;
		}
		const lines = source.split("\n");
		for (const [index, line] of lines.entries()) {
			if (rule.pattern.test(line)) {
				violations.push(`${file}:${index + 1}  ${rule.name}. ${rule.why}`);
			}
		}
	}
}

if (violations.length > 0) {
	console.error(["", "tenancy guard:", ...violations, ""].join("\n"));
	process.exit(1);
}

console.log(`tenancy guard: ${files.length} files clean`);
