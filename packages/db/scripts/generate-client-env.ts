export const GENERATE_PLACEHOLDER_URL =
	"postgresql://generate:generate@localhost:5432/generate";

export function generateEnv(source: Record<string, string | undefined>) {
	const env = Object.fromEntries(
		Object.entries(source).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);
	return { ...env, DATABASE_URL: env.DATABASE_URL || GENERATE_PLACEHOLDER_URL };
}

export function generateCommand(execPath: string = process.execPath) {
	return [execPath, "x", "prisma", "generate"];
}
