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
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";

export function ConnectMailbox({
	connected,
	href,
	children,
}: {
	connected: boolean;
	href: string;
	children?: ReactNode;
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
			<EmptyContent layout="row">
				<Button asChild>
					<Link href={href}>{t("Connect a mailbox")}</Link>
				</Button>
				{children}
			</EmptyContent>
		</Empty>
	);
}
