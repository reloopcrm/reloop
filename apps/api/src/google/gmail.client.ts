import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";
import { gmailPart } from "./gmail-mime";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const gmailMessageRef = z.object({
	id: z.string().optional(),
	threadId: z.string().optional(),
});

export const gmailMessage = z.object({
	id: z.string().optional(),
	threadId: z.string().optional(),
	labelIds: z.array(z.string()).optional(),
	snippet: z.string().optional(),
	internalDate: z.string().optional(),
	historyId: z.string().optional(),
	payload: gmailPart.optional(),
});

export type GmailMessage = z.infer<typeof gmailMessage>;

export const gmailMessageList = z.object({
	messages: z.array(gmailMessageRef).optional(),
	nextPageToken: z.string().optional(),
	resultSizeEstimate: z.number().optional(),
});

export type MessageList = z.infer<typeof gmailMessageList>;

export const gmailHistoryList = z.object({
	history: z
		.array(
			z.object({
				id: z.string().optional(),
				messagesAdded: z
					.array(z.object({ message: gmailMessageRef.optional() }))
					.optional(),
				labelsRemoved: z
					.array(
						z.object({
							message: gmailMessageRef.optional(),
							labelIds: z.array(z.string()).optional(),
						}),
					)
					.optional(),
			}),
		)
		.optional(),
	nextPageToken: z.string().optional(),
	historyId: z.string().optional(),
});

export type HistoryList = z.infer<typeof gmailHistoryList>;

export const gmailProfile = z.object({
	emailAddress: z.string().optional(),
	historyId: z.string().optional(),
});

export type Profile = z.infer<typeof gmailProfile>;

export const WORK_MAIL_QUERY =
	"-in:chats -in:drafts -in:spam -in:trash -category:promotions -category:social -category:forums";

export const SENT_MAIL_QUERY = `${WORK_MAIL_QUERY} in:sent`;

@Injectable()
export class GmailClient {
	constructor(private readonly api: MailboxApiClient) {}

	async profile(accessToken: string): Promise<MailboxResult<Profile>> {
		return this.api.get(`${BASE}/profile`, accessToken, gmailProfile);
	}

	async listMessages(
		accessToken: string,
		options: {
			after?: Date;
			before: Date;
			pageToken?: string;
			maxResults?: number;
			query?: string;
		},
	): Promise<MailboxResult<MessageList>> {
		const parts = [options.query ?? WORK_MAIL_QUERY];

		if (options.after) {
			parts.push(`after:${Math.floor(options.after.getTime() / 1000)}`);
		}
		parts.push(`before:${Math.ceil(options.before.getTime() / 1000)}`);

		return this.api.get(`${BASE}/messages`, accessToken, gmailMessageList, {
			q: parts.join(" "),
			maxResults: options.maxResults ?? 100,
			pageToken: options.pageToken,
		});
	}

	async listHistory(
		accessToken: string,
		options: { startHistoryId: string; pageToken?: string },
	): Promise<MailboxResult<HistoryList>> {
		return this.api.get(
			`${BASE}/history?historyTypes=messageAdded&historyTypes=labelRemoved`,
			accessToken,
			gmailHistoryList,
			{
				startHistoryId: options.startHistoryId,
				maxResults: 500,
				pageToken: options.pageToken,
			},
		);
	}

	async getMessage(
		accessToken: string,
		id: string,
	): Promise<MailboxResult<GmailMessage>> {
		return this.api.get(`${BASE}/messages/${id}`, accessToken, gmailMessage, {
			format: "full",
		});
	}
}
