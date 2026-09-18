import ConnectionSend from "@carbon/icons-react/es/ConnectionSend";
import Email from "@carbon/icons-react/es/Email";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import SlackLogo from "@crm/ui/components/brand-logos/slack";
import { Button } from "@crm/ui/components/button";
import { Loader } from "@crm/ui/components/loader";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Translate } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AddConnectionDialog } from "./add-connection-dialog";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Connections") };
}

export default function ConnectionsSettingsPage(
	props: PageProps<"/[slug]/settings/connections">,
) {
	return (
		<Suspense fallback={<ConnectionsFallback />}>
			<ConnectionsSettingsPageContent {...props} />
		</Suspense>
	);
}

async function ConnectionsSettingsPageContent({
	params,
	searchParams,
}: PageProps<"/[slug]/settings/connections">) {
	await requireSession();
	const [{ slug }, query, t] = await Promise.all([
		params,
		searchParams,
		getT(),
	]);
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	const [google, microsoft, slack, imap, webhooks] = await Promise.all([
		queryClient.fetchQuery(trpc.google.status.queryOptions()),
		queryClient.fetchQuery(trpc.microsoft.status.queryOptions()),
		queryClient.fetchQuery(trpc.slack.status.queryOptions()),
		queryClient.fetchQuery(trpc.imap.status.queryOptions()),
		queryClient.fetchQuery(trpc.webhooks.status.queryOptions()),
	]);
	const rows = [
		...(google.linked
			? [
					{
						name: "Google Workspace",
						status: t("Connected"),
						bringsIn: t("Emails, meetings and the people on them"),
						sends: t("Nothing yet"),
						href: `/${slug}/settings/connections/google`,
						logo: GoogleLogo,
					},
				]
			: []),
		...(slack.connected
			? [
					{
						name: "Slack",
						status: slack.workspace
							? t("Connected to {workspace}", { workspace: slack.workspace })
							: t("Connected"),
						bringsIn: t("Workspace members and channels the app has joined"),
						sends: t("Messages to approved channels and people"),
						href: `/${slug}/settings/connections/slack`,
						logo: SlackLogo,
					},
				]
			: []),
		...(microsoft.linked
			? [
					{
						name: "Microsoft 365",
						status: t("Connected"),
						bringsIn: t("Outlook email and the people on it"),
						sends: t("Nothing yet"),
						href: `/${slug}/settings/connections/microsoft`,
						logo: MicrosoftLogo,
					},
				]
			: []),
		...(imap.linked
			? [
					{
						name: "Mailbox (IMAP)",
						status:
							imap.accounts.length === 1
								? t("Connected to {mailbox}", {
										mailbox: imap.accounts[0]?.email ?? "",
									})
								: t("{count} mailboxes connected", {
										count: imap.accounts.length,
									}),
						bringsIn: t("Email from any IMAP mailbox, including its history"),
						sends: t("Nothing, so nothing here can change your mailbox"),
						href: `/${slug}/settings/connections/imap`,
						logo: Email,
					},
				]
			: []),
		...(webhooks.webhooks.length > 0
			? [
					{
						name: "Webhooks",
						status: webhookStatus(webhooks.webhooks, t),
						bringsIn: t("Nothing, so nothing here reads your other tools"),
						sends: t("Every event you pick, as signed JSON"),
						href: `/${slug}/settings/connections/webhooks`,
						logo: ConnectionSend,
					},
				]
			: []),
	];

	return (
		<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			{rows.length > 0 ? (
				<div className="mx-auto flex w-full max-w-(--container-page) flex-col gap-(--spacing-page-gap)">
					<header className="flex items-start justify-between gap-4 px-(--spacing-block-inline)">
						<div className="flex flex-col gap-2">
							<h1 className="font-medium text-2xl tracking-tight">
								{t("Connections")}
							</h1>
							<p className="max-w-2xl text-muted-foreground text-sm">
								{t(
									"Where your CRM gets its information, and what it is allowed to send on your behalf.",
								)}
							</p>
						</div>
						<Button asChild variant="outline">
							<Link href={`/${slug}/settings/connections?add=1`}>
								{t("Add connection")}
							</Link>
						</Button>
					</header>
					<div className="flex flex-col gap-3">
						{rows.map((row) => (
							<ConnectionCard key={row.name} {...row} />
						))}
					</div>
				</div>
			) : (
				<div className="mx-auto flex w-full max-w-(--container-narrow) flex-1 flex-col justify-center gap-(--spacing-page-gap) text-center">
					<div className="flex flex-col gap-2 px-(--spacing-block-inline)">
						<h1 className="font-medium text-2xl tracking-tight">
							{t("Nothing is connected yet")}
						</h1>
						<p className="text-muted-foreground text-sm leading-relaxed">
							{t(
								"Right now every deal, contact and note has to be typed in by hand. Connect a tool and the CRM starts filling itself in from the work your team already does.",
							)}
						</p>
					</div>
					<div className="flex flex-col divide-y rounded-lg border bg-card px-(--spacing-block-inline)">
						<StarterRow
							logo={GoogleLogo}
							name="Google Workspace"
							description={t(
								"File email and meetings against the right company",
							)}
							href={`/${slug}/settings/connections/google`}
						/>
						<StarterRow
							logo={SlackLogo}
							name="Slack"
							description={t(
								"Let deployed agents notify approved channels and people",
							)}
							href={`/${slug}/settings/connections/slack`}
						/>
						<StarterRow
							logo={MicrosoftLogo}
							name="Microsoft 365"
							description={t("File Outlook email against the right company")}
							href={`/${slug}/settings/connections/microsoft`}
						/>
						<StarterRow
							logo={Email}
							name="Mailbox (IMAP)"
							description={t("Any other mailbox, with its full history")}
							href={`/${slug}/settings/connections/imap`}
						/>
						<StarterRow
							logo={ConnectionSend}
							name="Webhooks"
							description={t(
								"Drive n8n, Zapier or your own script from CRM events",
							)}
							href={`/${slug}/settings/connections/webhooks`}
						/>
					</div>
					<p className="px-(--spacing-block-inline) text-muted-foreground text-sm">
						{t("Looking for something else?")}{" "}
						<Link
							className="font-medium text-foreground underline underline-offset-4"
							href={`/${slug}/settings/connections?add=1`}
						>
							{t("Browse all connections")}
						</Link>
					</p>
				</div>
			)}
			<AddConnectionDialog
				slug={slug}
				open={first(query.add) === "1"}
				connected={rows.map((row) => row.name)}
			/>
		</main>
	);
}

function ConnectionsFallback() {
	return (
		<main className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			<Loader size="lg" />
		</main>
	);
}

async function ConnectionCard({
	name,
	status,
	bringsIn,
	sends,
	href,
	logo: Logo,
}: {
	name: string;
	status: string;
	bringsIn: string;
	sends: string;
	href: string;
	logo: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
	const t = await getT();

	return (
		<section className="flex flex-col gap-4 rounded-lg border bg-card px-(--spacing-block-inline) py-4">
			<div className="flex items-center gap-3">
				<Logo className="size-5 shrink-0" />
				<h2 className="font-medium text-sm">{name}</h2>
				<p className="ml-auto text-right text-muted-foreground text-xs">
					{status}
				</p>
				<Button asChild size="sm" variant="outline">
					<Link href={href}>{t("Manage")}</Link>
				</Button>
			</div>
			<div className="flex flex-col gap-2 pl-8 text-sm">
				<CapabilityRow label={t("Brings in")} value={bringsIn} />
				<CapabilityRow label={t("Sends")} value={sends} />
			</div>
		</section>
	);
}

function CapabilityRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex gap-4">
			<span className="w-22 shrink-0 text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}

async function StarterRow({
	logo: Logo,
	name,
	description,
	href,
}: {
	logo: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	name: string;
	description: string;
	href: string;
}) {
	const t = await getT();

	return (
		<div className="flex items-center gap-3 py-4 text-left">
			<Logo className="size-5 shrink-0" />
			<div className="min-w-0 flex-1">
				<h2 className="font-medium text-sm">{name}</h2>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>
			<Button asChild variant="outline" size="sm">
				<Link href={href}>{t("Connect")}</Link>
			</Button>
		</div>
	);
}

function webhookStatus(
	webhooks: {
		enabled: boolean;
		lastStatus: number | null;
		lastError: string | null;
	}[],
	t: Translate,
): string {
	const failing = webhooks.find(
		(webhook) => webhook.enabled && webhook.lastError,
	);
	if (failing) {
		return t("The last delivery failed");
	}

	const sending = webhooks.filter((webhook) => webhook.enabled).length;
	if (sending === 0) return t("Switched off");

	return sending === 1
		? t("1 address is listening")
		: t("{count} addresses are listening", { count: sending });
}

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}
