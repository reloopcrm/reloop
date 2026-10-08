import { describe, expect, it } from "bun:test";
import { undoOfLater } from "@/app/(app)/[slug]/win-back/[contactId]/person-view";
import {
	winBackInput,
	winBackSearchParams,
	winBackTable,
} from "@/app/(app)/[slug]/win-back/win-back-search-params";
import german from "@/lib/i18n/de/win-back.json";
import spanish from "@/lib/i18n/es/win-back.json";
import french from "@/lib/i18n/fr/win-back.json";
import portuguese from "@/lib/i18n/pt-BR/win-back.json";
import turkish from "@/lib/i18n/tr/win-back.json";
import chinese from "@/lib/i18n/zh-Hans/win-back.json";

function loaded(href: string) {
	const url = new URL(href, "https://reloop.example");
	return winBackSearchParams(url.searchParams);
}

describe("the Snoozed filter", () => {
	it("is read from the URL and sent to the list", () => {
		const values = loaded("/acme/win-back?snoozed=true");

		expect(values.snoozed).toBe(true);
		expect(winBackInput(winBackTable.toInput(values), values).snoozed).toBe(
			true,
		);
	});

	it("is off in a plain list link", () => {
		const values = loaded("/acme/win-back?replied=true");

		expect(values.snoozed).toBe(false);
		expect(winBackInput(winBackTable.toInput(values), values)).toMatchObject({
			snoozed: false,
			replied: true,
		});
	});

	it("is named in every language", () => {
		const dictionaries: Record<string, string>[] = [
			german,
			spanish,
			french,
			portuguese,
			turkish,
			chinese,
		];

		expect((german as Record<string, string>).Snoozed).toBe("Zurückgestellt");
		for (const dictionary of dictionaries) {
			expect(dictionary.Snoozed?.length ?? 0).toBeGreaterThan(0);
			expect(dictionary["Bring back"]?.length ?? 0).toBeGreaterThan(0);
			expect(dictionary["Comes back"]?.length ?? 0).toBeGreaterThan(0);
			expect(dictionary["{name} is back in the list."]).toContain("{name}");
		}
		expect((german as Record<string, string>)["Bring back"]).toBe(
			"Zurückholen",
		);
	});

	it("names a group of people in the filter chips", () => {
		const chips: [Record<string, string>, string, string][] = [
			[spanish, "Pospuestos", "Han respondido"],
			[portuguese, "Adiados", "Responderam"],
			[turkish, "Ertelenenler", "Cevap yazanlar"],
		];

		for (const [dictionary, snoozed, wroteBack] of chips) {
			expect(dictionary.Snoozed).toBe(snoozed);
			expect(dictionary["Wrote back"]).toBe(wroteBack);
		}
	});
});

describe("Undo after Remind me", () => {
	it("deletes a reminder it just wrote", () => {
		expect(undoOfLater({ id: "task-1", movedFrom: null })).toEqual({
			kind: "remove",
			id: "task-1",
		});
	});

	it("puts a moved reminder back on its old day and subject", () => {
		expect(
			undoOfLater({
				id: "task-1",
				movedFrom: {
					dueAt: "2026-06-08T00:00:00.000Z",
					subject: "Get back to Ada",
				},
			}),
		).toEqual({
			kind: "restore",
			id: "task-1",
			dueAt: "2026-06-08T00:00:00.000Z",
			subject: "Get back to Ada",
		});
	});
});
