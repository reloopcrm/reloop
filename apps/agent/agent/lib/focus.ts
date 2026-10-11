import { bumpCounter, COUNTERS } from "@crm/telemetry";
import { defineState } from "eve/context";
import { RESEARCH } from "./research-config";

type FocusState = {
	contactId: string | null;
	companyId: string | null;
	sessionId: string | null;
	taskKind: string | null;
	spent: number;
	budget: number;
	exhausted: boolean;
};

export const focus = defineState<FocusState>("crm.focus", () => ({
	contactId: null,
	companyId: null,
	sessionId: null,
	taskKind: null,
	spent: 0,
	budget: RESEARCH.budget.defaultUnits,
	exhausted: false,
}));

export type CurrentFocus = {
	contactId: string | null;
	sessionId: string | null;
	taskKind: string | null;
};

export function currentFocus(): CurrentFocus {
	try {
		const state = focus.get();
		return {
			contactId: state.contactId,
			sessionId: state.sessionId,
			taskKind: state.taskKind,
		};
	} catch {
		return { contactId: null, sessionId: null, taskKind: null };
	}
}

export function focusOn(input: {
	contactId?: string | null;
	companyId?: string | null;
	sessionId?: string | null;
	taskKind?: string | null;
}): void {
	focus.update((current) => ({
		...current,
		contactId: input.contactId ?? current.contactId,
		companyId: input.companyId ?? current.companyId,
		sessionId: input.sessionId ?? current.sessionId,
		taskKind: input.taskKind ?? current.taskKind,
	}));
}

export function spend(units = 1): { ok: true } | { ok: false; reason: string } {
	const { spent, budget, exhausted } = focus.get();

	if (spent + units > budget) {
		if (!exhausted) {
			focus.update((current) => ({ ...current, exhausted: true }));
			void bumpCounter(COUNTERS.budgetExhausted);
		}

		return {
			ok: false,
			reason:
				`Research budget for this contact is spent (${spent}/${budget}). ` +
				"Write up what you already have, or schedule a recheck with a reason. Do not keep looking.",
		};
	}

	focus.update((current) => ({ ...current, spent: current.spent + units }));
	return { ok: true };
}

export function refund(units: number): void {
	focus.update((current) => ({
		...current,
		spent: Math.max(0, current.spent - units),
	}));
}

export function setBudget(budget: number): void {
	focus.update((current) => ({ ...current, budget, exhausted: false }));
}
