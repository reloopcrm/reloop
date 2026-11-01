import { API_URL, isMarketing } from "@/lib/env";
import type { Translate } from "@/lib/i18n/locale";
import { Card, Cards, Step, Steps } from "./article";
import { CodeFigure } from "./parts";

const MCP = {
	exampleAddress: "https://crm.example.com/api/mcp",
	path: "/api/mcp",
	serverName: "reloop",
	keyPlaceholder: "YOUR_KEY",
	clients: { chatgpt: "ChatGPT", claude: "Claude", claudeCode: "Claude Code" },
} as const;

function commands() {
	const address = isMarketing() ? MCP.exampleAddress : `${API_URL}${MCP.path}`;
	const add = `claude mcp add --transport http ${MCP.serverName} ${address}`;
	return {
		address,
		claudeCode: add,
		claudeCodeKey: `${add} --header "x-api-key: ${MCP.keyPlaceholder}"`,
		curl: `curl -X POST ${address} -H "x-api-key: ${MCP.keyPlaceholder}" -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
	};
}

export function AssistantSetup({ t }: { t: Translate }) {
	const { address, claudeCode, claudeCodeKey, curl } = commands();
	const copy = { copy: t("Copy"), copied: t("Copied") };
	const steps = (lines: readonly string[], first = 1) => (
		<Steps>
			{lines.map((line, index) => (
				<Step key={line} number={first + index} title={line}>
					{null}
				</Step>
			))}
		</Steps>
	);

	return (
		<>
			<div className="mc-callout">
				<span className="mc-callout-mark" aria-hidden="true" />
				<p>
					<b>{t("Your MCP address")}</b> <code>{address}</code>
				</p>
			</div>
			<Cards columns={1}>
				<Card title={MCP.clients.chatgpt}>
					{steps([
						t(
							"Open chatgpt.com/plugins, select the plus button, then Add custom MCP server.",
						),
						t("Enter the address below."),
						t("Choose OAuth as the authentication."),
						t(
							"Read the warning and confirm I understand and want to continue.",
						),
						t("Select Create as a plugin and install it."),
						t(
							"ChatGPT sends you to Reloop. Sign in and allow. ChatGPT needs an https address, so an install on localhost needs a tunnel.",
						),
					])}
				</Card>
				<Card title={MCP.clients.claude}>
					{steps([
						t("Open Customize, then Connectors, then Add custom connector."),
						t("Enter the address below."),
						t("Under OAuth client choose Register automatically."),
						t("Select Add, then Connect. Sign in to Reloop and allow."),
						t(
							"On a Team or Enterprise plan an Owner adds it once under Organization settings, Connectors. Then each member selects Connect.",
						),
					])}
				</Card>
				<Card title={MCP.clients.claudeCode}>
					{steps([t("Run this command in your terminal.")])}
					<CodeFigure code={claudeCode} caption={t("Terminal")} labels={copy} />
					{steps(
						[
							t("Type /mcp inside Claude Code and sign in in the browser."),
							t("To use an API key instead, run this command."),
						],
						2,
					)}
					<CodeFigure
						code={claudeCodeKey}
						caption={t("Terminal")}
						labels={copy}
					/>
				</Card>
				<Card title={t("Other")}>
					{steps([
						t(
							"Use any MCP client with Streamable HTTP. It signs in with OAuth and dynamic client registration, or it sends the header x-api-key.",
						),
						t("This command lists the tools with a key."),
					])}
					<CodeFigure code={curl} caption={t("Terminal")} labels={copy} />
				</Card>
			</Cards>
		</>
	);
}
