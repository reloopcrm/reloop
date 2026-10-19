"use client";

import Bot from "@carbon/icons-react/es/Bot";
import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { Step, Steps } from "@crm/ui/components/steps";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId } from "react";
import { toast } from "sonner";
import { CopyCommand } from "@/components/copy-command";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CopyValue } from "../../copy-value";

type AiClient = RouterOutputs["mcp"]["status"]["clients"][number];

const CLIENT_NAMES = {
	chatgpt: "ChatGPT",
	claude: "Claude",
	claudeCode: "Claude Code",
} as const;

export type AiConnectionProps = {
	address: string;
	secure: boolean;
	claudeCodeCommand: string;
	claudeCodeKeyCommand: string;
	apiKeyHeader: string;
	apiKeysHref: string;
	connectionsHref: string;
	scopeLabels: Record<string, string>;
};

function AddressCard({ address }: { address: string }) {
	const t = useT();

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("The MCP address of your CRM")}</CardTitle>
				<CardDescription>
					{t("Paste this address into the assistant you want to connect.")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-2">
					<code className="min-w-0 flex-1 break-all font-mono text-sm">
						{address}
					</code>
					<CopyValue value={address} label="Address" />
				</div>
			</CardContent>
		</Card>
	);
}

function ConnectSteps({
	secure,
	claudeCodeCommand,
	claudeCodeKeyCommand,
	apiKeyHeader,
	apiKeysHref,
}: Omit<AiConnectionProps, "address" | "connectionsHref" | "scopeLabels">) {
	const t = useT();
	const keyCommandId = useId();

	return (
		<Tabs defaultValue="chatgpt" className="px-(--spacing-block-inline)">
			<TabsList>
				<TabsTrigger value="chatgpt">{CLIENT_NAMES.chatgpt}</TabsTrigger>
				<TabsTrigger value="claude">{CLIENT_NAMES.claude}</TabsTrigger>
				<TabsTrigger value="claude-code">{CLIENT_NAMES.claudeCode}</TabsTrigger>
				<TabsTrigger value="other">{t("Other")}</TabsTrigger>
			</TabsList>

			<TabsContent value="chatgpt" className="flex flex-col gap-4 pt-4">
				{secure ? null : (
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>{t("ChatGPT needs an https address")}</AlertTitle>
						<AlertDescription>
							{t(
								"This address starts with http, so ChatGPT refuses it. Put the CRM behind https first.",
							)}
						</AlertDescription>
					</Alert>
				)}
				<Steps>
					<Step>
						{t("Open chatgpt.com/plugins and select the plus button.")}
					</Step>
					<Step>
						{t("Select Add custom MCP server and paste your MCP address.")}
					</Step>
					<Step>{t("Pick OAuth as the authentication.")}</Step>
					<Step>
						{t(
							"Read the warning, then confirm I understand and want to continue.",
						)}
					</Step>
					<Step>{t("Select Create as a plugin, then install it.")}</Step>
					<Step>
						{t(
							"ChatGPT registers itself and sends you to Reloop. Sign in and select Allow.",
						)}
					</Step>
				</Steps>
			</TabsContent>

			<TabsContent value="claude" className="flex flex-col gap-4 pt-4">
				<Steps>
					<Step>
						{t(
							"In Claude, open Customize, then Connectors, then Add custom connector.",
						)}
					</Step>
					<Step>{t("Paste your MCP address.")}</Step>
					<Step>{t("Under OAuth client, choose Register automatically.")}</Step>
					<Step>
						{t("Select Add, then Connect. Sign in to Reloop and select Allow.")}
					</Step>
				</Steps>
				<p className="text-muted-foreground text-sm">
					{t(
						"On a Team or Enterprise plan, an Owner adds it once under Organization settings, Connectors: Add, Custom, type Web. Then every member selects Connect.",
					)}
				</p>
			</TabsContent>

			<TabsContent value="claude-code" className="flex flex-col gap-4 pt-4">
				<Steps>
					<Step>{t("Run this command in a terminal.")}</Step>
				</Steps>
				<CopyCommand command={claudeCodeCommand} />
				<Steps>
					<Step>
						{t("Type /mcp in Claude Code and sign in in the browser.")}
					</Step>
				</Steps>
				<div className="flex flex-col gap-2">
					<label
						htmlFor={keyCommandId}
						className="text-muted-foreground text-sm"
					>
						{t(
							"With an API key instead, run this and put your key in place of YOUR_KEY.",
						)}
					</label>
					<InputGroup>
						<InputGroupInput
							id={keyCommandId}
							value={claudeCodeKeyCommand}
							readOnly
						/>
						<InputGroupAddon align="inline-end">
							<CopyValue value={claudeCodeKeyCommand} label="Command" />
						</InputGroupAddon>
					</InputGroup>
				</div>
			</TabsContent>

			<TabsContent value="other" className="flex flex-col gap-4 pt-4">
				<Steps>
					<Step>{t("Use any MCP client that speaks Streamable HTTP.")}</Step>
					<Step>{t("Give it your MCP address.")}</Step>
					<Step>
						{t(
							"Sign in with OAuth, or send the {header} header with a key from Settings, API Keys.",
							{ header: apiKeyHeader },
						)}
					</Step>
				</Steps>
				<div>
					<Button asChild variant="link">
						<Link href={apiKeysHref}>{t("Create an API key")}</Link>
					</Button>
				</div>
			</TabsContent>
		</Tabs>
	);
}

function ClientCard({
	client,
	scopeLabels,
}: {
	client: AiClient;
	scopeLabels: Record<string, string>;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const name = client.name ?? t("Unnamed client");

	const revoke = useMutation(
		trpc.mcp.revoke.mutationOptions({
			onSuccess: async () => {
				await cache.mcp();
				toast.success(t("{name} is disconnected.", { name }));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{name}</CardTitle>
				<CardDescription>
					{t("Connected")} <LocalRelativeTime date={client.connectedAt} />
					{" · "}
					{t("Last used")}{" "}
					{client.lastUsedAt ? (
						<LocalRelativeTime date={client.lastUsedAt} />
					) : (
						t("Never")
					)}
				</CardDescription>
				<CardAction>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="outline" size="sm" disabled={revoke.isPending}>
								{t("Revoke")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									{t("Disconnect {name}?", { name })}
								</AlertDialogTitle>
								<AlertDialogDescription>
									{t(
										"It can no longer read your CRM. To use it again, connect it again from the assistant.",
									)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									onClick={() => revoke.mutate({ id: client.id })}
								>
									{t("Revoke")}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</CardAction>
			</CardHeader>
			{client.scopes.length > 0 ? (
				<CardContent>
					<div className="flex flex-wrap gap-2">
						{client.scopes.map((scope) => (
							<Badge key={scope}>{scopeLabels[scope] ?? scope}</Badge>
						))}
					</div>
				</CardContent>
			) : null}
		</Card>
	);
}

export function AiConnection({
	address,
	connectionsHref,
	scopeLabels,
	...steps
}: AiConnectionProps) {
	const t = useT();
	const trpc = useTRPC();

	const status = useQuery(trpc.mcp.status.queryOptions());
	const clients = status.data?.clients ?? [];

	return (
		<>
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<h1 className="flex items-center gap-2 font-medium text-2xl tracking-tight">
					<Icon icon={Bot} />
					{t("AI assistants")}
				</h1>
				<p className="max-w-2xl text-muted-foreground text-sm">
					{t(
						"Let ChatGPT, Claude or Claude Code read your CRM, and nothing more.",
					)}
				</p>
			</header>

			<AddressCard address={address} />

			<ConnectSteps {...steps} />

			<section className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<h2 className="font-medium text-base">
					{t("What an assistant can read")}
				</h2>
				<p className="text-muted-foreground text-sm">
					{t(
						"Contacts, companies, deals, the Win back list, the story and mail summaries and excerpts of a person, and the draft Reloop prepared.",
					)}
				</p>
				<p className="text-muted-foreground text-sm">
					{t(
						"It cannot write, send or change anything. You copy the text it writes and send it yourself.",
					)}
				</p>
				<p className="text-muted-foreground text-sm">
					{t(
						"What it reads goes to that vendor, such as OpenAI or Anthropic, because you chose it. Revoke it here at any time. Removing a member ends it too.",
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="px-(--spacing-block-inline) font-medium text-base">
					{t("Connected")}
				</h2>
				{clients.length === 0 ? (
					<p className="px-(--spacing-block-inline) text-muted-foreground text-sm">
						{t("Nothing is connected yet.")}
					</p>
				) : (
					clients.map((client) => (
						<ClientCard
							key={client.id}
							client={client}
							scopeLabels={scopeLabels}
						/>
					))
				)}
			</section>

			<div className="px-(--spacing-block-inline)">
				<Button asChild variant="link">
					<Link href={connectionsHref}>{t("Back to connections")}</Link>
				</Button>
			</div>
		</>
	);
}
