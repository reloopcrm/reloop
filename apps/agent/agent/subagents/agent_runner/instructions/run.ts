import { defineDynamic, defineInstructions } from "eve/instructions";
import { approvedRunInstructions } from "../../../lib/run-runtime";
import { attribute, purposeOf } from "../../../lib/session-purpose";
import { withTenant } from "../../../lib/tenant";

export default defineDynamic({
	events: {
		"session.started": async (_event, ctx) => {
			if (purposeOf(ctx) !== "team-agent") return null;
			const runId = attribute(ctx, "runId");
			if (!runId) return null;

			return withTenant(ctx, async () =>
				defineInstructions({
					markdown: `# Human-approved version instructions\n\n${await approvedRunInstructions(runId)}`,
				}),
			);
		},
	},
});
