"use client";

import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Status } from "@crm/ui/components/mark";
import { useT } from "@/lib/i18n/client";
import {
	potentialPresentation,
	type RecordPotential,
	type RecordStanding,
	standingLabel,
	standingTone,
} from "@/lib/record-standing";

export function StandingCell({
	standing,
}: {
	standing: RecordStanding | null;
}) {
	const t = useT();
	if (!standing) return <EmptyCellValue />;

	return (
		<Status tone={standingTone(standing)}>{t(standingLabel(standing))}</Status>
	);
}

export function PotentialCell({
	potential,
}: {
	potential: RecordPotential | null;
}) {
	const t = useT();
	if (!potential) return <EmptyCellValue />;

	const { label, tone } = potentialPresentation(potential);

	return <Status tone={tone}>{t(label)}</Status>;
}
