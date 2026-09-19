import {
	appSecretKey,
	isSealedSecret,
	openSecret,
	sealSecret,
} from "./secrets";

const SECOND_MS = 1_000;

export const TYPESAFE = {
	purpose: "typesafe-key",
	endpoint: "https://api.typesafe.ai/v1/systemone",
	model: "jev-latest",
	envVar: "TYPESAFE_API_KEY",
	key: {
		minLength: 8,
		maxLength: 200,
	},
	gate: {
		question: "relevant",
		threshold: 0.2,
		timeoutMs: 8 * SECOND_MS,
		businessMaxChars: 4_000,
	},
} as const;

export function sealTypesafeKey(key: string): string {
	return sealSecret(key, appSecretKey(TYPESAFE.purpose));
}

export function openTypesafeKey(stored: string): string {
	const value = stored.trim();
	if (!isSealedSecret(value)) return value;

	return openSecret(value, appSecretKey(TYPESAFE.purpose));
}
