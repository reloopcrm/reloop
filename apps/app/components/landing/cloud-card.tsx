import { Badge } from "@crm/ui/components/badge";
import { getT } from "@/lib/i18n/server";
import { CardBody, CardTitle } from "./bento-card";
import { FormCard } from "./page-blocks";
import { WaitlistForm } from "./waitlist-form";

export async function CloudCard() {
	const t = await getT();
	return (
		<FormCard>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<CardTitle>{t("Cloud")}</CardTitle>
					<Badge variant="secondary">{t("Soon")}</Badge>
				</div>
				<CardBody>
					{t("A hosted Reloop CRM, with updates and backups handled for you.")}
				</CardBody>
			</div>
			<WaitlistForm />
		</FormCard>
	);
}
