export type GateCount = {
	asked: number;
	hits: number;
	failed: number;
	word: string;
};

const totals = new Map<string, GateCount>();
const pass = new Map<string, GateCount>();

function add(
	into: Map<string, GateCount>,
	gate: string,
	hit: boolean,
	word: string,
) {
	const row = into.get(gate) ?? { asked: 0, hits: 0, failed: 0, word };
	row.asked += 1;
	if (hit) row.hits += 1;
	into.set(gate, row);
}

function addFailure(into: Map<string, GateCount>, gate: string, word: string) {
	const row = into.get(gate) ?? { asked: 0, hits: 0, failed: 0, word };
	row.failed += 1;
	into.set(gate, row);
}

export function countGate(gate: string, hit: boolean, word: string): void {
	add(totals, gate, hit, word);
	add(pass, gate, hit, word);
}

export function countGateFailure(gate: string, word: string): void {
	addFailure(totals, gate, word);
	addFailure(pass, gate, word);
}

export function gateCounts(): Record<string, GateCount> {
	return Object.fromEntries(
		[...totals].map(([gate, row]) => [gate, { ...row }]),
	);
}

export function drainGateCounts(): string | null {
	if (pass.size === 0) return null;

	const line = [...pass]
		.map(([gate, row]) => {
			const line = `${gate} asked ${row.asked} ${row.word} ${row.hits}`;

			return row.failed === 0 ? line : `${line} failed ${row.failed}`;
		})
		.join(", ");
	pass.clear();

	return line;
}

export function resetGateCounts(): void {
	totals.clear();
	pass.clear();
}
