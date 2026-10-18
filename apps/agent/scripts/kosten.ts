import { db } from "@crm/db";
import { readModelSpend } from "@crm/db/model-spend";

const DAYS = Number.parseInt(process.argv[2] ?? "30", 10);
const DAY_MS = 24 * 60 * 60 * 1_000;

const euro = (dollars: number) => dollars * 0.92;

const digits = (dollars: number) => (dollars < 1 ? 4 : 2);

const money = (dollars: number) =>
	`${dollars.toFixed(digits(dollars))} $ (${euro(dollars).toFixed(digits(dollars))} €)`;

async function main(): Promise<void> {
	const since = new Date(Date.now() - DAYS * DAY_MS);
	const report = await readModelSpend(db, since);

	console.log(`Modellkosten seit ${report.since.toISOString().slice(0, 10)}`);
	console.log("");

	if (report.lines.length === 0) {
		console.log("Noch nichts gezaehlt. Der Agent hat seitdem nichts gerufen.");
		await db.$disconnect();
		return;
	}

	for (const line of report.lines) {
		const perCall = line.calls > 0 ? line.costUsd / line.calls : 0;
		console.log(
			[
				line.kind.padEnd(18),
				line.model.padEnd(18),
				`${String(line.calls).padStart(7)} Aufrufe`,
				`${money(line.costUsd).padStart(22)}`,
				line.priced
					? `${(perCall * 100).toFixed(3)} ct je Aufruf`
					: "kein Preis hinterlegt",
			].join("  "),
		);
	}

	console.log("");
	console.log(`Summe: ${money(report.costUsd)} aus ${report.calls} Aufrufen`);
	console.log(
		`Pro Monat hochgerechnet: ${money((report.costUsd / DAYS) * 30)}`,
	);

	await db.$disconnect();
}

await main();
