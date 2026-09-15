import { db } from "../src/client";
import { isPlanId } from "../src/plans";
import { writePlan } from "../src/settings";

const chosen = process.argv[2];
if (chosen !== "none" && !isPlanId(chosen)) {
	throw new Error("Choose test, handel, handel-plus, or none.");
}
try {
	await writePlan(db, chosen === "none" ? null : chosen);
	console.log("Plan updated by the server operator.");
} finally {
	await db.$disconnect();
}
