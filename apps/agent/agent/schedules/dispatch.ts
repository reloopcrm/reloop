import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import { sweepBlankFacts } from "../lib/blank-facts";
import {
	pendingAgentRunIds,
	pendingBuilderSubmissionIds,
	queueDueAgentRuns,
} from "../lib/custom-agent-dispatch";
import { brief, drainAll, taskAuth } from "../lib/dispatch";
import { collapsing } from "../lib/pool";
import { reconcileStaleTasks } from "../lib/stale-tasks";
import { eachActiveTenant, tenantAttributes } from "../lib/tenant";

type Args = Parameters<
	NonNullable<Parameters<typeof defineSchedule>[0]["run"]>
>[0];

const tick = collapsing(async ({ receive, appAuth }: Args) => {
	await eachActiveTenant("dispatch tick", async () => {
		const auth = { ...appAuth, attributes: tenantAttributes() };

		await Promise.all([
			sweepBlankFacts(),

			(async () => {
				await reconcileStaleTasks();
				await drainAll((task) =>
					receive(crm, {
						message: brief(task),
						target: { taskId: task.id },
						auth: taskAuth(task, auth),
					}),
				);
				await queueDueAgentRuns();
				const [builderIds, runIds] = await Promise.all([
					pendingBuilderSubmissionIds(),
					pendingAgentRunIds(),
				]);

				await Promise.all([
					...builderIds.map((builderSubmissionId) =>
						receive(crm, {
							message: "Continue a queued private agent-builder chat.",
							target: { builderSubmissionId },
							auth,
						}),
					),
					...runIds.map((runId) =>
						receive(crm, {
							message: "Execute a queued deployed agent run.",
							target: { runId },
							auth,
						}),
					),
				]);
			})(),
		]);
	});
});

export default defineSchedule({
	cron: "* * * * *",
	async run(args) {
		args.waitUntil(tick(args));
	},
});
