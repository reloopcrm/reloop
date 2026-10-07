export const GENERATE_PLACEHOLDER_URL =
	"postgresql://generate:generate@localhost:5432/generate";

export function generateEnv(
	source: Record<string, string | undefined>,
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined) env[key] = value;
	}
	if (!env.DATABASE_URL) env.DATABASE_URL = GENERATE_PLACEHOLDER_URL;
	return env;
}
