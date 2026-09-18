import { defineTool } from "eve/tools";
import { z } from "zod";
import { sample } from "../lib/business-setup";
import { runFieldProposals } from "../lib/field-proposals";

export default defineTool({
	description:
		"Read the newest mail and propose the custom fields this business would fill in every week. Use it when a rep asks what the CRM should track, or asks for the fields to be looked at again. It writes proposals only. A person accepts or dismisses each one on the Fields sheet, and nothing reaches a record until they do. It runs by itself once, when the business is first set up, so call it only when somebody asks.",
	inputSchema: z.object({}),
	async execute() {
		return { outcome: await runFieldProposals(await sample()) };
	},
});
