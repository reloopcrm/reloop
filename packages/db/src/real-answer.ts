import { Prisma } from "./generated/prisma/client";
import {
	AUTO_REPLY_BODY_CHARS,
	AUTOMATED_MESSAGE_PATTERNS,
} from "./message-text";

const SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function postgresPattern(sources: readonly string[]): string {
	const alternatives = sources
		.map((source) => `(?:${source.replaceAll(String.raw`\b`, String.raw`\y`)})`)
		.join("|");

	return `(?p)${alternatives}`;
}

const SENDER = postgresPattern(AUTOMATED_MESSAGE_PATTERNS.sender);
const SUBJECT = postgresPattern(AUTOMATED_MESSAGE_PATTERNS.subject);
const BODY = postgresPattern(AUTOMATED_MESSAGE_PATTERNS.body);

export function realAnswer(messageAlias: string): Prisma.Sql {
	if (!SQL_ALIAS.test(messageAlias)) {
		throw new Error(`Not a SQL alias: ${messageAlias}`);
	}
	const m = Prisma.raw(messageAlias);

	return Prisma.sql`(
		${m}."direction" = 'INBOUND'
		AND ${m}."fromEmail" !~* ${SENDER}
		AND COALESCE(${m}."subject", '') !~* ${SUBJECT}
		AND left(COALESCE(${m}."body", ${m}."snippet", ''), ${AUTO_REPLY_BODY_CHARS}::int) !~* ${BODY}
	)`;
}
