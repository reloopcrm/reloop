"use client";

import ConnectionSend from "@carbon/icons-react/es/ConnectionSend";
import Email from "@carbon/icons-react/es/Email";
import Filter from "@carbon/icons-react/es/Filter";
import Plug from "@carbon/icons-react/es/Plug";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import SlackLogo from "@crm/ui/components/brand-logos/slack";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export function AddConnectionDialog({
	slug,
	open,
	connected,
}: {
	slug: string;
	open: boolean;
	connected: string[];
}) {
	const t = useT();
	const router = useRouter();

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) router.replace(`/${slug}/settings/connections`);
			}}
		>
			<DialogContent className="max-w-(--container-narrow) gap-0 p-0 md:left-[calc(50%+calc((56px+213px)/2))]">
				<DialogHeader className="gap-2 px-(--spacing-block-inline) pt-5 pb-4">
					<DialogTitle className="text-base">
						{t("Add a connection")}
					</DialogTitle>
					<DialogDescription>
						{t(
							"Imported email is visible to every member of this workspace. Connect only a mailbox approved for team access.",
						)}
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col border-y px-2 py-2">
					{!connected.includes("Google Workspace") ? (
						<CatalogRow
							logo={GoogleLogo}
							name="Google Workspace"
							description={t(
								"Bring in Gmail messages and Google Calendar meetings",
							)}
							href={`/${slug}/settings/connections/google`}
						/>
					) : null}
					{!connected.includes("Slack") ? (
						<CatalogRow
							logo={SlackLogo}
							name="Slack"
							description={t(
								"Let deployed agents notify approved channels and people",
							)}
							href={`/${slug}/settings/connections/slack`}
						/>
					) : null}
					{!connected.includes("Microsoft 365") ? (
						<CatalogRow
							logo={MicrosoftLogo}
							name="Microsoft 365"
							description={t("Bring in Outlook email and the people on it")}
							href={`/${slug}/settings/connections/microsoft`}
						/>
					) : null}
					{!connected.includes("Mailbox (IMAP)") ? (
						<CatalogRow
							logo={Email}
							name="Mailbox (IMAP)"
							description={t(
								"Bring in email from any IMAP mailbox, including its history",
							)}
							href={`/${slug}/settings/connections/imap`}
						/>
					) : null}
					{!connected.includes("Webhooks") ? (
						<CatalogRow
							logo={ConnectionSend}
							name="Webhooks"
							description={t(
								"Send every event you pick to n8n, Zapier or your own script",
							)}
							href={`/${slug}/settings/connections/webhooks`}
						/>
					) : null}
					{!connected.includes("TypeSafe") ? (
						<CatalogRow
							logo={Filter}
							name="TypeSafe"
							description={t(
								"Read every mail conversation cheaply first, and pay for the full read only when it looks like business",
							)}
							href={`/${slug}/settings/connections/typesafe`}
						/>
					) : null}
					<CatalogRow
						logo={Plug}
						name={t("Anything else")}
						description={t("Read and write every record through the REST API")}
						href={`/${slug}/settings/connections/intake`}
					/>
				</div>
				<p className="px-(--spacing-block-inline) py-4 text-muted-foreground text-xs">
					{connected.length === 0
						? t("Nothing is connected yet.")
						: connected.length === 1
							? t("{names} is already connected.", {
									names: connected.join(", "),
								})
							: t("{names} are already connected.", {
									names: connected.join(", "),
								})}
				</p>
			</DialogContent>
		</Dialog>
	);
}

function CatalogRow({
	logo: Logo,
	name,
	description,
	href,
}: {
	logo: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	name: string;
	description: string;
	href?: string;
}) {
	const content = (
		<>
			<Logo className="size-5 shrink-0" />
			<div>
				<p className="font-medium text-sm">{name}</p>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>
		</>
	);
	return href ? (
		<Link
			href={href}
			className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-muted"
		>
			{content}
		</Link>
	) : (
		<div
			aria-disabled="true"
			className="flex items-center gap-3 rounded-md px-3 py-3 opacity-60"
		>
			{content}
		</div>
	);
}
