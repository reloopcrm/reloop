import { Prisma } from "./generated/prisma/client";
import {
	AUTO_REPLY_BODY_CHARS,
	AUTOMATED_MESSAGE_PATTERNS,
} from "./message-text";

const SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function alternatives(sources: readonly string[]): string {
	return sources
		.map((source) => `(?:${source.replaceAll(String.raw`\b`, String.raw`\y`)})`)
		.join("|");
}

export function postgresPattern(sources: readonly string[]): string {
	return `(?p)${alternatives(sources)}`;
}

const QUOTE_START = String.raw`(?n)(?<=.|\n)(?:${alternatives(AUTOMATED_MESSAGE_PATTERNS.quoteStart)})`;

const SENDER = postgresPattern(AUTOMATED_MESSAGE_PATTERNS.sender);
const SUBJECT = postgresPattern(AUTOMATED_MESSAGE_PATTERNS.subject);
const BODY = postgresPattern(AUTOMATED_MESSAGE_PATTERNS.body);

export function realAnswer(messageAlias: string): Prisma.Sql {
	if (!SQL_ALIAS.test(messageAlias)) {
		throw new Error(`Not a SQL alias: ${messageAlias}`);
	}
	const m = Prisma.raw(messageAlias);
	const stored = Prisma.sql`COALESCE(${m}."body", ${m}."snippet", '')`;
	const quoteAt = Prisma.sql`NULLIF(regexp_instr(${stored}, ${QUOTE_START}, 1, 1, 0, 'i'), 0)`;
	const authored = Prisma.sql`left(${stored}, LEAST(${AUTO_REPLY_BODY_CHARS}::int, COALESCE(${quoteAt} - 1, ${AUTO_REPLY_BODY_CHARS}::int)))`;

	return Prisma.sql`(
		${m}."direction" = 'INBOUND'
		AND ${m}."fromEmail" !~* ${SENDER}
		AND COALESCE(${m}."subject", '') !~* ${SUBJECT}
		AND ${authored} !~* ${BODY}
	)`;
}
