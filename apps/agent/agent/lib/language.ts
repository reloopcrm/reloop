export function writesGerman(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.RELOOP_GERMAN === "true";
}

export function language(env: NodeJS.ProcessEnv = process.env): string {
	return writesGerman(env) ? "German" : "English";
}

export function say(
	english: string,
	german: string,
	env: NodeJS.ProcessEnv = process.env,
): string {
	return writesGerman(env) ? german : english;
}
