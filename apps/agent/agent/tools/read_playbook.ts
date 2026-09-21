import { defineTool } from "eve/tools";
import { z } from "zod";
import { readPlaybook } from "../lib/playbook";
import { tenantTool } from "../lib/tenant";

const tool = defineTool({
	description:
		"Read what the CRM learned from the rep's own sent emails: the offers and conditions they usually make, what they accept and decline, and how they speak to customers. Use it before judging whether a conversation is worth following up or when drafting how the rep would answer. Bounded and free.",
	inputSchema: z.object({}),
	async execute() {
		const playbook = await readPlaybook();
		if (!playbook) {
			return {
				found: false as const,
				reason:
					"Nothing learned yet; the rep's sent emails have not been read.",
			};
		}
		return { found: true as const, ...playbook };
	},
});

export default tenantTool(tool);
