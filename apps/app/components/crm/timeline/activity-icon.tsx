import ArrowDownLeft from "@carbon/icons-react/es/ArrowDownLeft";
import ArrowUpRight from "@carbon/icons-react/es/ArrowUpRight";
import type { ActivityType, EmailDirection } from "@crm/db/enums";
import { Icon } from "@crm/ui/components/icon";
import { activityIcon } from "@/lib/activity-presentation";

export function ActivityIcon({
	type,
	direction,
}: {
	type: ActivityType;
	direction?: EmailDirection | null;
}) {
	if (type === "EMAIL" && direction) {
		return (
			<Icon icon={direction === "OUTBOUND" ? ArrowUpRight : ArrowDownLeft} />
		);
	}
	return <Icon icon={activityIcon(type)} />;
}
