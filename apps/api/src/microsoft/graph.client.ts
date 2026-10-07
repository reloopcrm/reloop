import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";

const BASE = "https://graph.microsoft.com/v1.0/me";
const GRAPH_ORIGIN = new URL(BASE).origin;

function isGraphLink(link: string): boolean {
	try {
		return new URL(link).origin === GRAPH_ORIGIN;
	} catch {
		return false;
	}
}

const MESSAGE_FIELDS = [
	"id",
	"internetMessageId",
	"conversationId",
	"subject",
	"from",
	"sender",
	"toRecipients",
	"ccRecipients",
	"receivedDateTime",
	"sentDateTime",
	"body",
	"bodyPreview",
	"internetMessageHeaders",
	"parentFolderId",
	"webLink",
].join(",");

function graphOptional<T extends z.ZodType>(schema: T) {
	return schema
		.nullish()
		.transform((value) => value ?? undefined)
		.optional();
}

const graphAddress = z.object({
	emailAddress: graphOptional(
		z.object({
			name: graphOptional(z.string()),
			address: graphOptional(z.string()),
		}),
	),
});

export type GraphAddress = z.infer<typeof graphAddress>;

export const graphMessage = z.object({
	id: graphOptional(z.string()),
	internetMessageId: graphOptional(z.string()),
	conversationId: graphOptional(z.string()),
	subject: z.string().nullish(),
	from: graphOptional(graphAddress),
	sender: graphOptional(graphAddress),
	toRecipients: graphOptional(z.array(graphAddress)),
	ccRecipients: graphOptional(z.array(graphAddress)),
	receivedDateTime: graphOptional(z.string()),
	sentDateTime: graphOptional(z.string()),
	body: graphOptional(
		z.object({
			contentType: graphOptional(z.string()),
			content: graphOptional(z.string()),
		}),
	),
	bodyPreview: graphOptional(z.string()),
	internetMessageHeaders: graphOptional(
		z.array(
			z.object({
				name: graphOptional(z.string()),
				value: graphOptional(z.string()),
			}),
		),
	),
	parentFolderId: graphOptional(z.string()),
	webLink: graphOptional(z.string()),
});

export type GraphMessage = z.infer<typeof graphMessage>;

export const graphMessagePage = z.object({
	value: z.array(graphMessage).optional(),
	"@odata.nextLink": z.string().optional(),
});

export type MessagePage = z.infer<typeof graphMessagePage>;

export const graphUser = z.object({
	mail: z.string().nullish(),
	userPrincipalName: z.string().nullish(),
});

export type GraphUser = z.infer<typeof graphUser>;

export const graphFolder = z.object({
	id: graphOptional(z.string()),
});

export type GraphFolder = z.infer<typeof graphFolder>;

@Injectable()
export class GraphClient {
	constructor(private readonly api: MailboxApiClient) {}

	async me(accessToken: string): Promise<MailboxResult<GraphUser>> {
		return this.api.get(BASE, accessToken, graphUser, {
			$select: "mail,userPrincipalName",
		});
	}

	async folder(
		accessToken: string,
		wellKnownName: string,
	): Promise<MailboxResult<GraphFolder>> {
		return this.api.get(
			`${BASE}/mailFolders/${wellKnownName}`,
			accessToken,
			graphFolder,
			{ $select: "id" },
		);
	}

	async listMessages(
		accessToken: string,
		options: {
			after: Date;
			before?: Date;
			top: number;
			order?: "asc" | "desc";
			folder?: string;
		},
	): Promise<MailboxResult<MessagePage>> {
		const filters = [`receivedDateTime gt ${options.after.toISOString()}`];
		if (options.before) {
			filters.push(`receivedDateTime lt ${options.before.toISOString()}`);
		}
		filters.push("isDraft eq false");

		const path = options.folder
			? `${BASE}/mailFolders/${options.folder}/messages`
			: `${BASE}/messages`;

		return this.api.get(path, accessToken, graphMessagePage, {
			$select: MESSAGE_FIELDS,
			$filter: filters.join(" and "),
			$orderby: `receivedDateTime ${options.order ?? "asc"}`,
			$top: options.top,
		});
	}

	async nextPage(
		accessToken: string,
		nextLink: string,
	): Promise<MailboxResult<MessagePage>> {
		if (!isGraphLink(nextLink)) {
			return {
				outcome: "cursor-invalid",
				reason: `A page link outside ${GRAPH_ORIGIN} is refused.`,
			};
		}

		return this.api.get(nextLink, accessToken, graphMessagePage);
	}
}
