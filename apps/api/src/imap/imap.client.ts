import { resolvePublicHost } from "@crm/db/safe-fetch";
import { Injectable, Logger } from "@nestjs/common";
import { ImapFlow } from "imapflow";
import { z } from "zod";
import { IMAP } from "./imap.config";
import type { RawImapMessage } from "./imap-message";

export type ImapSettings = {
	host: string;
	port: number;
	secure: boolean;
	username: string;
	password: string;
};

export type ImapFolder = {
	path: string;
	specialUse: string | null;
	selectable: boolean;
};

export type ImapFolderState = {
	uidValidity: string;
	uidNext: number;
	exists: number;
};

export type ImapSession = {
	folders(): Promise<ImapFolder[]>;
	open(path: string): Promise<ImapFolderState>;
	uidsSince(since: Date): Promise<number[]>;
	fetch(range: string): AsyncIterable<RawImapMessage>;
	close(): Promise<void>;
};

export type ImapConnectFailure = {
	outcome: "auth" | "unreachable" | "failed";
	reason: string;
};

export type ImapConnectResult =
	| { outcome: "ok"; session: ImapSession }
	| ImapConnectFailure;

const imapServerError = z
	.object({
		message: z.string().catch(""),
		responseText: z.string().catch(""),
		authenticationFailed: z.boolean().catch(false),
		code: z.string().catch(""),
	})
	.catch({
		message: "",
		responseText: "",
		authenticationFailed: false,
		code: "",
	});

export type ImapServerError = z.infer<typeof imapServerError>;

@Injectable()
export class ImapClientFactory {
	private readonly logger = new Logger(ImapClientFactory.name);

	async connect(settings: ImapSettings): Promise<ImapConnectResult> {
		const target = await resolvePublicHost(settings.host);
		if (!target)
			return {
				outcome: "unreachable",
				reason: "The mail server must have a public network address.",
			};
		const client = new ImapFlow({
			host: target.address,
			servername: settings.host,
			doSTARTTLS: settings.secure ? undefined : true,
			port: settings.port,
			secure: settings.secure,
			auth: { user: settings.username, pass: settings.password },
			logger: false,
			disableAutoIdle: true,
			connectionTimeout: IMAP.connect.connectionTimeoutMs,
			greetingTimeout: IMAP.connect.greetingTimeoutMs,
			socketTimeout: IMAP.connect.socketTimeoutMs,
		});

		client.on("error", (error: Error) => {
			this.logger.warn({
				message: "IMAP connection reported an error",
				host: settings.host,
				reason: classifyConnectError(imapServerError.parse(error)).reason,
			});
		});

		try {
			await client.connect();
		} catch (error) {
			client.close();
			return classifyConnectError(imapServerError.parse(error));
		}

		return { outcome: "ok", session: sessionOf(client) };
	}
}

export function classifyConnectError(
	failure: ImapServerError,
): ImapConnectFailure {
	const text =
		failure.responseText.trim() || failure.message || "Unknown error.";

	if (failure.authenticationFailed) {
		return {
			outcome: "auth",
			reason:
				"The mail server refused the sign-in. Check your username and app password.",
		};
	}

	const code = failure.code;
	if (
		[
			"ENOTFOUND",
			"ECONNREFUSED",
			"ETIMEDOUT",
			"EHOSTUNREACH",
			"ECONNRESET",
		].includes(code) ||
		/timed? ?out|greeting/i.test(text)
	) {
		return {
			outcome: "unreachable",
			reason:
				"The mail server could not be reached. Check its address, port and encryption.",
		};
	}

	return {
		outcome: "failed",
		reason:
			"The mail connection failed. Check the server settings and encryption.",
	};
}

function sessionOf(client: ImapFlow): ImapSession {
	return {
		async folders() {
			const listed = await client.list();

			return listed.map((entry) => ({
				path: entry.path,
				specialUse: entry.specialUse ?? null,
				selectable: !entry.flags.has(IMAP.folders.noSelectFlag),
			}));
		},

		async open(path) {
			const mailbox = await client.mailboxOpen(path, { readOnly: true });

			return {
				uidValidity: String(mailbox.uidValidity),
				uidNext: mailbox.uidNext,
				exists: mailbox.exists,
			};
		},

		async uidsSince(since) {
			const found = await client.search({ since }, { uid: true });
			return Array.isArray(found) ? found : [];
		},

		async *fetch(range) {
			for await (const message of client.fetch(
				range,
				{
					uid: true,
					internalDate: true,
					source: { maxLength: IMAP.sync.sourceMaxBytes },
				},
				{ uid: true },
			)) {
				if (!message.source) continue;

				yield {
					uid: message.uid,
					source: message.source,
					internalDate: dateOf(message.internalDate),
				};
			}
		},

		async close() {
			try {
				await client.logout();
			} catch {
				client.close();
			}
		},
	};
}

function dateOf(value: Date | string | undefined): Date | null {
	if (!value) return null;
	const at = value instanceof Date ? value : new Date(value);
	return Number.isNaN(at.getTime()) ? null : at;
}
