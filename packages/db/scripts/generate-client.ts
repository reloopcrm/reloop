import { generateEnv } from "./generate-client-env";

const result = Bun.spawnSync(["bunx", "prisma", "generate"], {
	env: generateEnv(process.env),
	stdout: "inherit",
	stderr: "inherit",
});

process.exit(result.exitCode);
