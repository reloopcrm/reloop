import { DEMO_DATA } from "../src/demo/demo.config";
import {
	demoCounts,
	removeDemoData,
	resolveDemoOwner,
	seedDemoData,
} from "../src/demo/demo-data";

async function main(): Promise<void> {
	const { db } = await import("@crm/db");

	if (process.argv.includes("--remove")) {
		const removed = await removeDemoData(db);
		console.log(`Removed demo rows: ${JSON.stringify(removed)}`);
	} else {
		const owner = await resolveDemoOwner(db);
		console.log(`Seeding demo rows owned by ${owner.email}.`);
		await db.$transaction((tx) => seedDemoData(db, tx, owner), {
			timeout: DEMO_DATA.write.timeoutMs,
			maxWait: DEMO_DATA.write.maxWaitMs,
		});
		console.log(
			`Demo rows now in the database: ${JSON.stringify(await demoCounts(db))}`,
		);
	}

	await db.$disconnect();
}

if (import.meta.main) await main();
