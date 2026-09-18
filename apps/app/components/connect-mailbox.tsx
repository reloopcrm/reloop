"use client";

import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

export function ConnectMailbox({
	connected,
	href,
}: {
	connected: boolean;
	href: string;
}) {
	const t = useT();

	if (connected) return null;

	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>{t("Your CRM is waiting for your email")}</EmptyTitle>
				<EmptyDescription>
					{t(
						"Companies, people and deals appear here once this CRM can read the mail you already send. Nothing here has to be typed in by hand.",
					)}
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button asChild>
					<Link href={href}>{t("Connect a mailbox")}</Link>
				</Button>
			</EmptyContent>
		</Empty>
	);
}
