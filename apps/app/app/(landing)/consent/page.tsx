import { Button } from "@crm/ui/components/button";
import { Step, Steps } from "@crm/ui/components/steps";
import type { Metadata } from "next";
import NextLink from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { getSession, oauthClientOf, workspaceRow } from "@/lib/session";
import { ConsentForm } from "./consent-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Allow access") };
}

export const instant = false;

const REFRESH_SCOPE = "offline_access";

const consentRequest = z.object({
	client_id: z.string().trim().min(1),
	scope: z
		.string()
		.optional()
		.transform((value) => (value ?? "").split(" ").filter(Boolean)),
});

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function queryOf(params: SearchParams): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		for (const entry of Array.isArray(value) ? value : [value]) {
			if (entry !== undefined) query.append(key, entry);
		}
	}
	return query.toString();
}

export default async function ConsentPage({
	searchParams,
}: PageProps<"/consent">) {
	const [t, params, session] = await Promise.all([
		getT(),
		searchParams,
		getSession(),
	]);

	if (!session) {
		const query = queryOf(params);
		redirect(query ? `/sign-in?${query}` : "/sign-in");
	}

	const request = consentRequest.safeParse({
		client_id: first(params.client_id),
		scope: first(params.scope),
	});
	const client = request.success
		? await oauthClientOf(request.data.client_id)
		: null;

	if (!request.success || !client) {
		const workspace = await workspaceRow();
		return (
			<AuthShell>
				<AuthHeading
					title={t("This connection request is not valid.")}
					description={t(
						"Start again from the AI assistant you want to connect.",
					)}
				/>
				<div>
					<Button asChild variant="link">
						<NextLink href={workspace ? `/${workspace.slug}` : "/"}>
							{t("Back to your workspace")}
						</NextLink>
					</Button>
				</div>
			</AuthShell>
		);
	}

	const name = client.name ?? t("An AI assistant");

	return (
		<AuthShell>
			<AuthHeading
				title={t("Allow {name} to read your CRM?", { name })}
				description={t(
					"It reads with your account. It cannot write, send or change anything.",
				)}
			/>

			<div className="flex flex-col gap-3">
				<p className="text-sm">{t("{name} may read:", { name })}</p>
				<Steps>
					<Step>{t("Contacts, companies and deals")}</Step>
					<Step>{t("The Win back list")}</Step>
					<Step>
						{t(
							"The story of a person, with summaries and excerpts of the mail",
						)}
					</Step>
					<Step>{t("The draft Reloop prepared")}</Step>
				</Steps>
			</div>

			<p className="text-pretty text-muted-foreground text-sm">
				{t(
					"What it reads goes to the company that runs {name}. You can revoke it any time in Settings, Connections, AI assistants.",
					{ name },
				)}
			</p>

			{request.data.scope.includes(REFRESH_SCOPE) ? (
				<p className="text-pretty text-muted-foreground text-sm">
					{t("It stays connected until you revoke it.")}
				</p>
			) : null}

			<ConsentForm />

			<p className="text-muted-foreground text-sm">
				{t("Signed in as {email}", { email: session.user.email })}
			</p>
		</AuthShell>
	);
}
