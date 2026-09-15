import { Badge } from "@crm/ui/components/badge";
import { BentoCard, CardBody, CardTitle } from "./bento-card";
import { WaitlistForm } from "./waitlist-form";

export function CloudCard() {
	return (
		<BentoCard className="gap-5">
			<div className="flex items-center gap-2">
				<CardTitle>Cloud</CardTitle>
				<Badge variant="secondary">Soon</Badge>
			</div>
			<CardBody>
				A hosted Reloop CRM, with updates and backups handled for you.
			</CardBody>
			<WaitlistForm />
		</BentoCard>
	);
}
