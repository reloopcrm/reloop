import Email from "@carbon/icons-react/es/Email";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { Button } from "@crm/ui/components/button";
import NextLink from "next/link";
import type { Translate } from "@/lib/i18n/locale";
import { HOME } from "./config";

export function MailboxPicker({ t }: { t: Translate }) {
	return (
		<ul
			aria-label={t("Choose a mailbox")}
			className="flex flex-col rounded-lg bg-secondary px-4 py-1 text-foreground"
		>
			<li className="flex min-h-15 items-center gap-3 border-border border-b py-2">
				<GoogleLogo width={HOME.iconSize} height={HOME.iconSize} />
				<span className="grow font-medium">Gmail</span>
				<Button variant="outline-ghost" size="pill-sm" asChild>
					<NextLink href={HOME.href.change}>{t("Change mailbox")}</NextLink>
				</Button>
			</li>
			<li className="flex min-h-15 items-center gap-3 border-border border-b py-2">
				<MicrosoftLogo width={HOME.iconSize} height={HOME.iconSize} />
				<span className="grow font-medium">Outlook</span>
			</li>
			<li className="flex min-h-15 items-center gap-3 py-2">
				<Email
					size={HOME.iconSize}
					aria-hidden="true"
					className="shrink-0 text-body-foreground"
				/>
				<span className="grow font-medium">IMAP</span>
			</li>
		</ul>
	);
}
