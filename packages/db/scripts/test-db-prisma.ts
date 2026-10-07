import { existsSync } from "node:fs";
import { join } from "node:path";

export type PrismaCommand = { command: string; args: string[] };

export function prismaCommand(
	packageDirs: string[],
	subcommand: string[],
): PrismaCommand {
	for (const directory of packageDirs) {
		const binary = join(directory, "node_modules", ".bin", "prisma");
		if (existsSync(binary)) return { command: binary, args: subcommand };
	}

	return { command: "bunx", args: ["prisma", ...subcommand] };
}
