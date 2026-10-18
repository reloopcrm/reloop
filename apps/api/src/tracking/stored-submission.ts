import type { JsonValue } from "@crm/db";
import { MEDIUMS, type Touch } from "@crm/db/attribution";
import { z } from "zod";

export type FormFields = Record<string, string>;

export const storedTouch = z.object({
	source: z.string(),
	medium: z.enum(MEDIUMS),
	campaign: z.string().nullable(),
	term: z.string().nullable(),
	content: z.string().nullable(),
	referrer: z.string().nullable(),
	landing: z.string().nullable(),
	at: z.iso.datetime(),
});

export type StoredTouch = z.infer<typeof storedTouch>;

export const storedFields = z.record(z.string(), z.string());

export function storeTouch(touch: Touch): StoredTouch {
	return {
		source: touch.source,
		medium: touch.medium,
		campaign: touch.campaign,
		term: touch.term,
		content: touch.content,
		referrer: touch.referrer,
		landing: touch.landing,
		at: touch.at.toISOString(),
	};
}

export type StoredRead<T> = { ok: true; value: T } | { ok: false };

export function readStoredTouch(
	value: JsonValue | null,
): StoredRead<Touch | undefined> {
	if (value === null) return { ok: true, value: undefined };

	const parsed = storedTouch.safeParse(value);
	if (!parsed.success) return { ok: false };

	return { ok: true, value: { ...parsed.data, at: new Date(parsed.data.at) } };
}

export function readStoredFields(value: JsonValue): StoredRead<FormFields> {
	const parsed = storedFields.safeParse(value);

	return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

export function nameFrom(fields: FormFields): string | null {
	const first = pick(fields, /^(first[\s_-]?name|fname|given)/i);
	const last = pick(fields, /^(last[\s_-]?name|lname|surname|family)/i);

	if (first) return last ? `${first} ${last}` : first;

	return pick(fields, /^(full[\s_-]?name|name)$/i) ?? pick(fields, /name/i);
}

function pick(fields: FormFields, pattern: RegExp): string | null {
	for (const [key, value] of Object.entries(fields)) {
		if (pattern.test(key) && value.trim()) return value.trim();
	}

	return null;
}
