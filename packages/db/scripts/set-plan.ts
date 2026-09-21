import { db } from "../src/client";
import { canonicalPlanId, PLAN_IDS } from "../src/plans";
import { writePlan } from "../src/settings";

const chosen = process.argv[2];
const plan = chosen === "none" ? null : canonicalPlanId(chosen);
if (chosen !== "none" && plan === null) {
	throw new Error(`Choose ${PLAN_IDS.join(", ")}, or none.`);
}
try {
	await writePlan(db, plan);
	console.log("Plan updated by the server operator.");
} finally {
	await db.$disconnect();
}
