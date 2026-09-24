import { defineDynamic, defineInstructions } from "eve/instructions";
import { language } from "../../../lib/language";
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
					markdown: `Write every note, task and message this run creates in ${language()}, unless the approved instructions name another language.\n\n# Human-approved version instructions\n\n${await approvedRunInstructions(runId)}`,
				}),
			);
		},
	},
});
