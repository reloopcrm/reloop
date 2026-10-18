import { generateCommand, generateEnv } from "./generate-client-env";

const result = Bun.spawnSync(generateCommand(), {
	env: generateEnv(process.env),
	stdout: "inherit",
	stderr: "inherit",
});

process.exit(result.exitCode);
