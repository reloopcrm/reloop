import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { MCP } from "./mcp.config";
import type { McpCaller } from "./mcp-caller";
import {
	type ContactDraftToolOutput,
	type ContactMailsToolOutput,
	type ContactToolOutput,
	contactDraftToolOutput,
	contactMailsToolOutput,
	contactToolInput,
	contactToolOutput,
	type FetchToolOutput,
	fetchToolInput,
	fetchToolOutput,
	type SearchToolOutput,
	searchToolInput,
	searchToolOutput,
	type ThreadToolOutput,
	threadToolInput,
	threadToolOutput,
	type WinBackToolOutput,
	winBackToolInput,
	winBackToolOutput,
} from "./mcp-tools.contracts";
import { McpToolsService } from "./mcp-tools.service";

const READ_ONLY = { readOnlyHint: true } as const;

export const MCP_TOOL_NAMES = [
	"search",
	"fetch",
	"list_win_back_candidates",
	"get_contact",
	"get_contact_mails",
	"get_contact_draft",
	"get_thread",
] as const;

type McpToolName = (typeof MCP_TOOL_NAMES)[number];

type McpToolOutput =
	| SearchToolOutput
	| FetchToolOutput
	| WinBackToolOutput
	| ContactToolOutput
	| ContactMailsToolOutput
	| ContactDraftToolOutput
	| ThreadToolOutput;

function toolError(message: string): CallToolResult {
	return { isError: true, content: [{ type: "text", text: message }] };
}

@Injectable()
export class McpServerFactory {
	private readonly logger = new Logger(McpServerFactory.name);

	constructor(private readonly tools: McpToolsService) {}

	build(caller: McpCaller): McpServer {
		const server = new McpServer(MCP.server);

		server.registerTool(
			"search",
			{
				title: "Search the CRM",
				description:
					"Searches the Reloop CRM for companies, contacts and deals by name, email address or domain. Returns record ids for the fetch tool and a link to each record in the CRM.",
				inputSchema: searchToolInput,
				outputSchema: searchToolOutput,
				annotations: READ_ONLY,
			},
			({ query }) =>
				this.answer("search", caller, () => this.tools.searchRecords(query)),
		);

		server.registerTool(
			"fetch",
			{
				title: "Fetch a CRM record",
				description:
					'Reads one company, contact or deal by the id the search tool returned, for example "contact:abc123". Returns a readable summary of the record and its link.',
				inputSchema: fetchToolInput,
				outputSchema: fetchToolOutput,
				annotations: READ_ONLY,
			},
			({ id }) =>
				this.answer("fetch", caller, () => this.tools.fetchRecord(id)),
		);

		server.registerTool(
			"list_win_back_candidates",
			{
				title: "List win back candidates",
				description:
					"Lists the customers who went quiet and are worth winning back, ranked exactly as the Win back page ranks them. Each row is a company or a person, with potential, quiet days, whether they wait on us, and what Reloop remembers about them.",
				inputSchema: winBackToolInput,
				outputSchema: winBackToolOutput,
				annotations: READ_ONLY,
			},
			(input) =>
				this.answer("list_win_back_candidates", caller, () =>
					this.tools.winBack(caller, input),
				),
		);

		server.registerTool(
			"get_contact",
			{
				title: "Get a contact",
				description:
					"Reads one contact: name, email, phone, title, company, owner, deals and the research brief. When the person has mail, it also returns the win back story, potential, quiet days and order facts.",
				inputSchema: contactToolInput,
				outputSchema: contactToolOutput,
				annotations: READ_ONLY,
			},
			({ contactId }) =>
				this.answer("get_contact", caller, () => this.tools.contact(contactId)),
		);

		server.registerTool(
			"get_contact_mails",
			{
				title: "Get the mails of a contact",
				description:
					"Lists the newest emails exchanged with one contact, as the person page in the CRM shows them: subject, direction, sender, date, summary and a shortened body. Use get_thread with a threadId for the whole conversation.",
				inputSchema: contactToolInput,
				outputSchema: contactMailsToolOutput,
				annotations: READ_ONLY,
			},
			({ contactId }) =>
				this.answer("get_contact_mails", caller, () =>
					this.tools.contactMails(contactId),
				),
		);

		server.registerTool(
			"get_contact_draft",
			{
				title: "Get the draft reply for a contact",
				description:
					"Reads the email draft Reloop wrote for one contact. The draft is Reloop's suggestion: the user reviews it and sends it themselves from their own mailbox. Nothing is sent by this tool. When no draft exists yet, it says whether one is queued.",
				inputSchema: contactToolInput,
				outputSchema: contactDraftToolOutput,
				annotations: READ_ONLY,
			},
			({ contactId }) =>
				this.answer("get_contact_draft", caller, () =>
					this.tools.contactDraft(contactId),
				),
		);

		server.registerTool(
			"get_thread",
			{
				title: "Get an email thread",
				description:
					"Reads one email conversation: subject, company, contact, the summary Reloop wrote, and the newest messages with sender, recipients, date, summary and a shortened body.",
				inputSchema: threadToolInput,
				outputSchema: threadToolOutput,
				annotations: READ_ONLY,
			},
			({ threadId }) =>
				this.answer("get_thread", caller, () => this.tools.thread(threadId)),
		);

		return server;
	}

	private async answer<T extends McpToolOutput>(
		tool: McpToolName,
		caller: McpCaller,
		work: () => Promise<T>,
	): Promise<CallToolResult> {
		try {
			const value = await work();
			this.logger.log({
				message: "MCP tool answered",
				tool,
				userId: caller.userId,
				credential: caller.credential,
			});
			return {
				structuredContent: value,
				content: [{ type: "text", text: JSON.stringify(value) }],
			};
		} catch (error) {
			if (
				error instanceof HttpException &&
				error.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
			) {
				return toolError(error.message);
			}
			this.logger.error(
				{ message: "MCP tool failed", tool, userId: caller.userId },
				error instanceof Error ? error.stack : undefined,
			);
			return toolError(MCP.messages.toolFailed);
		}
	}
}
