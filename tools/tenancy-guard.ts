import { readFileSync } from "node:fs";

type Rule = {
	name: string;
	pattern: RegExp;
	allowed: readonly string[];
	skipTests: boolean;
	why: string;
};

const RULES: readonly Rule[] = [
	{
		name: "new PrismaClient / new PrismaPg",
		pattern: /new Prisma(Client|Pg)\(/,
		allowed: ["packages/db/src/client.ts"],
		skipTests: false,
		why: "Every client comes from packages/db/src/client.ts, which resolves the tenant.",
	},
	{
		name: "process.env.ALLOWED_SIGN_IN",
		pattern: /(?<!delete )process\.env\.ALLOWED_SIGN_IN(?!\s*=[^=])/,
		allowed: ["packages/auth/src/workspace.ts"],
		skipTests: true,
		why: "The allow-list is read through allowList() in packages/auth/src/workspace.ts, which knows the tenant.",
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

const violations: string[] = [];

for (const file of files) {
	const source = readFileSync(file, "utf8");
	for (const rule of RULES) {
		if (rule.allowed.includes(file)) continue;
		if (rule.skipTests && TEST_FILE.test(file)) continue;
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
