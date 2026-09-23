export type ModelPrice = {
	input: number;
	cacheRead: number;
	cacheWrite: number | null;
	output: number;
};

export const MODEL_PRICES = {
	"gpt-6-astra": { input: 10, cacheRead: 1, cacheWrite: 12.5, output: 50 },
	"gpt-6-sol": { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 },
	"gpt-6-luna": {
		input: 0.1,
		cacheRead: 0.01,
		cacheWrite: 0.125,
		output: 0.5,
	},
	"gpt-5.6-sol": { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 },
	"gpt-5.6-terra": { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 12 },
	"gpt-5.6-luna": {
		input: 0.2,
		cacheRead: 0.02,
		cacheWrite: 0.25,
		output: 1.2,
	},
	"gpt-5.5": { input: 5, cacheRead: 0.5, cacheWrite: null, output: 30 },
	"claude-opus-5": { input: 5, cacheRead: 0.5, cacheWrite: 6.25, output: 25 },
	"claude-sonnet-5": { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 },
	"claude-haiku-4-5": { input: 1, cacheRead: 0.1, cacheWrite: 1.25, output: 5 },
} as const satisfies Record<string, ModelPrice>;

export const PRICED_MODELS = Object.keys(MODEL_PRICES);

export const PER_TOKENS = 1_000_000;

export type TokenCount = {
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
};

function isPricedModel(name: string): name is keyof typeof MODEL_PRICES {
	return Object.hasOwn(MODEL_PRICES, name);
}

export function priceOf(model: string): ModelPrice | null {
	if (isPricedModel(model)) return MODEL_PRICES[model];

	const bare = model.includes("/") ? model.slice(model.indexOf("/") + 1) : null;
	return bare && isPricedModel(bare) ? MODEL_PRICES[bare] : null;
}

export function costOf(model: string, tokens: TokenCount): number | null {
	const price = priceOf(model);
	if (!price) return null;

	const write = price.cacheWrite ?? price.input;
	const dollars =
		(tokens.input * price.input +
			tokens.cacheRead * price.cacheRead +
			tokens.cacheWrite * write +
			tokens.output * price.output) /
		PER_TOKENS;

	return Math.round(dollars * 1_000_000) / 1_000_000;
}
