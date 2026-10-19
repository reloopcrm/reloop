"use client";

import { Button } from "@crm/ui/components/button";
import { Step, Steps } from "@crm/ui/components/steps";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import NextLink from "next/link";
import { CopyCommand } from "@/components/copy-command";
import { useT } from "@/lib/i18n/client";

const CLIENT_NAMES = {
	chatgpt: "ChatGPT",
	claude: "Claude",
	claudeCode: "Claude Code",
} as const;

export type AiAssistantsTabsProps = {
	address: string;
	settingsHref: string;
	claudeCodeCommand: string;
	claudeCodeKeyCommand: string;
	curlCommand: string;
};

export function AiAssistantsTabs({
	address,
	settingsHref,
	claudeCodeCommand,
	claudeCodeKeyCommand,
	curlCommand,
}: AiAssistantsTabsProps) {
	const t = useT();

	return (
		<div className="mt-12 flex flex-col gap-6 max-[900px]:mt-9">
			<Tabs defaultValue="chatgpt">
				<TabsList>
					<TabsTrigger value="chatgpt">{CLIENT_NAMES.chatgpt}</TabsTrigger>
					<TabsTrigger value="claude">{CLIENT_NAMES.claude}</TabsTrigger>
					<TabsTrigger value="claude-code">
						{CLIENT_NAMES.claudeCode}
					</TabsTrigger>
					<TabsTrigger value="other">{t("Other")}</TabsTrigger>
				</TabsList>
				<TabsContent value="chatgpt" className="pt-6">
					<Steps>
						<Step>
							{t(
								"Open chatgpt.com/plugins, select the plus button, then Add custom MCP server.",
							)}
						</Step>
						<Step>{t("Enter the address below.")}</Step>
						<Step>{t("Choose OAuth as the authentication.")}</Step>
						<Step>
							{t(
								"Read the warning and confirm I understand and want to continue.",
							)}
						</Step>
						<Step>{t("Select Create as a plugin and install it.")}</Step>
						<Step>
							{t(
								"ChatGPT sends you to Reloop. Sign in and allow. ChatGPT needs an https address, so an install on localhost needs a tunnel.",
							)}
						</Step>
					</Steps>
				</TabsContent>
				<TabsContent value="claude" className="pt-6">
					<Steps>
						<Step>
							{t("Open Customize, then Connectors, then Add custom connector.")}
						</Step>
						<Step>{t("Enter the address below.")}</Step>
						<Step>
							{t("Under OAuth client choose Register automatically.")}
						</Step>
						<Step>
							{t("Select Add, then Connect. Sign in to Reloop and allow.")}
						</Step>
						<Step>
							{t(
								"On a Team or Enterprise plan an Owner adds it once under Organization settings, Connectors. Then each member selects Connect.",
							)}
						</Step>
					</Steps>
				</TabsContent>
				<TabsContent value="claude-code" className="pt-6">
					<div className="flex flex-col gap-4">
						<Steps>
							<Step>{t("Run this command in your terminal.")}</Step>
						</Steps>
						<CopyCommand command={claudeCodeCommand} />
						<Steps>
							<Step>
								{t("Type /mcp inside Claude Code and sign in in the browser.")}
							</Step>
							<Step>{t("To use an API key instead, run this command.")}</Step>
						</Steps>
						<CopyCommand command={claudeCodeKeyCommand} />
					</div>
				</TabsContent>
				<TabsContent value="other" className="pt-6">
					<div className="flex flex-col gap-4">
						<Steps>
							<Step>
								{t(
									"Use any MCP client with Streamable HTTP. It signs in with OAuth and dynamic client registration, or it sends the header x-api-key.",
								)}
							</Step>
							<Step>{t("This command lists the tools with a key.")}</Step>
						</Steps>
						<CopyCommand command={curlCommand} />
					</div>
				</TabsContent>
			</Tabs>
			<div className="flex flex-col gap-2">
				<p className="text-muted-foreground text-xs">{t("Your MCP address")}</p>
				<p className="wrap-anywhere font-mono text-sm">{address}</p>
			</div>
			<div>
				<Button asChild variant="outline">
					<NextLink href={settingsHref}>{t("Open the settings")}</NextLink>
				</Button>
			</div>
		</div>
	);
}
