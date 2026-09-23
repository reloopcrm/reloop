"use client";

import { Badge } from "@crm/ui/components/badge";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { useT } from "@/lib/i18n/client";
import {
	potentialPresentation,
	type RecordPotential,
	type RecordStanding,
	standingLabel,
} from "@/lib/record-standing";

export function StandingCell({
	standing,
}: {
	standing: RecordStanding | null;
}) {
	const t = useT();
	if (!standing) return <EmptyCellValue />;

	return <Badge>{t(standingLabel(standing))}</Badge>;
}

export function PotentialCell({
	potential,
}: {
	potential: RecordPotential | null;
}) {
	const t = useT();
	if (!potential) return <EmptyCellValue />;

	const { label, text } = potentialPresentation(potential);

	return <span className={text}>{t(label)}</span>;
}
