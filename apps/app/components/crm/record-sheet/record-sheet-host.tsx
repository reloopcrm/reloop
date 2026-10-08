"use client";

import { useState } from "react";
import { AgentDiagnosticsProvider } from "@/components/crm/agent-diagnostics";
import { FieldsSheetHost } from "@/components/crm/fields/fields-sheet";
import { CloseReasonDialog } from "@/components/crm/stage-change";
import { DetailSheet } from "@/components/detail-sheet";
import { CompanySheet } from "./company-sheet";
import { ContactSheet } from "./contact-sheet";
import { DealSheet } from "./deal-sheet";
import { type RecordRef, recordKey, useRecordStack } from "./record-stack";

export function RecordSheetHost({ canManage }: { canManage: boolean }) {
	const { stack, top, closeAll } = useRecordStack();

	const [shown, setShown] = useState<RecordRef | null>(top);
	if (top && (!shown || recordKey(shown) !== recordKey(top))) {
		setShown(top);
	}

	return (
		<AgentDiagnosticsProvider canManage={canManage}>
			<DetailSheet
				open={stack.length > 0}
				onOpenChange={(next) => {
					if (!next) closeAll();
				}}
			>
				{shown?.kind === "company" ? (
					<CompanySheet key={recordKey(shown)} companyId={shown.id} />
				) : null}

				{shown?.kind === "contact" ? (
					<ContactSheet key={recordKey(shown)} contactId={shown.id} />
				) : null}

				{shown?.kind === "deal" ? (
					<DealSheet key={recordKey(shown)} dealId={shown.id} />
				) : null}
			</DetailSheet>

			<FieldsSheetHost />

			<CloseReasonDialog />
		</AgentDiagnosticsProvider>
	);
}
