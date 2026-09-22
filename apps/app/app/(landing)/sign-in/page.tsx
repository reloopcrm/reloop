import type { MailboxProviderId } from "@crm/auth/scopes";
import { isHosted } from "@crm/db/tenant-context";
import { Alert, AlertTitle } from "@crm/ui/components/alert";
import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import {
	FormCard,
	FormHeading,
	FormPage,
} from "@/components/landing/page-blocks";
import { getT } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { signInErrorText } from "@/lib/sign-in-errors";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { PasswordSignIn } from "./password-sign-in";
import { SocialSignIn } from "./social-sign-in";
import { type SsoProvider, SsoSignIn } from "./sso-sign-in";
import { WorkspaceLookup } from "./workspace-lookup";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Sign in"),
		description: t("Sign in to your Reloop CRM workspace."),
	};
}

type SignInOptions = {
	google: boolean;
	microsoft: boolean;
	password: boolean;
	providers: SsoProvider[];
};

async function signInOptions(): Promise<SignInOptions | null> {
	try {
		return await getServerQueryClient().fetchQuery(
			getServerTrpc().sso.signInOptions.queryOptions(),
		);
	} catch (error) {
		unstable_rethrow(error);
		console.error("Sign-in: could not read the sign-in options.", error);
		return null;
	}
}

async function currentSession() {
	try {
		return await getSession();
	} catch (error) {
		unstable_rethrow(error);
		console.error("Sign-in: could not read the session.", error);
		return null;
	}
}

export default async function SignInPage({
	searchParams,
}: PageProps<"/sign-in">) {
	const t = await getT();

	return (
		<FormPage>
			<Suspense
				fallback={
					<FormHeading
						title={t("Welcome back")}
						lede={t("Sign in with your account to continue.")}
					/>
				}
			>
				<SignIn searchParams={searchParams} />
			</Suspense>
		</FormPage>
	);
}

async function SignIn({
	searchParams,
}: Pick<PageProps<"/sign-in">, "searchParams">) {
	const t = await getT();
	const hosted = isHosted();
	const [session, options, { method, error }] = await Promise.all([
		currentSession(),
		hosted ? null : signInOptions(),
		searchParams,
	]);

	if (session) {
		redirect("/");
	}

	const failure = signInErrorText(Array.isArray(error) ? undefined : error);

	if (hosted) {
		return (
			<>
				<FormHeading
					title={t("Welcome back")}
					lede={t("Enter your work email address and we find your workspace.")}
				/>

				<FormCard>
					{failure ? (
						<Alert variant="destructive">
							<AlertTitle>{t(failure.label, failure.vars)}</AlertTitle>
						</Alert>
					) : null}

					<WorkspaceLookup />
				</FormCard>
			</>
		);
	}

	const configured: MailboxProviderId[] = [];
	if (options?.google ?? true) configured.push("google");
	if (options?.microsoft ?? false) configured.push("microsoft");

	const providers = options?.providers ?? [];

	const insisted = configured.find((provider) => provider === method);
	const showSso = providers.length > 0 && insisted === undefined;
	const showPassword = (options?.password ?? false) && insisted === undefined;
	const social =
		insisted !== undefined
			? [insisted]
			: providers.length === 0
				? configured
				: [];

	if (!showSso && !showPassword && social.length === 0) {
		return (
			<>
				<FormHeading
					title={t("No way in yet")}
					lede={t(
						"This CRM has no sign-in method configured, so nobody can get in, including you.",
					)}
				/>

				<FormCard>
					<p className="text-pretty text-muted-foreground text-sm/5">
						{t(
							"Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET, in the root .env file and restart. Your own identity provider can be added from Settings once somebody is signed in.",
						)}
					</p>

					<p className="text-pretty text-muted-foreground text-sm/5">
						{t(
							'Without an identity provider, set PASSWORD_SIGN_IN="1" in the same file and give yourself a password with the set-password script.',
						)}
					</p>
				</FormCard>
			</>
		);
	}

	const socialLeads = !showSso && !showPassword;

	return (
		<>
			<FormHeading
				title={t("Welcome back")}
				lede={t("Sign in with your account to continue.")}
			/>

			<FormCard>
				{failure ? (
					<Alert variant="destructive">
						<AlertTitle>{t(failure.label, failure.vars)}</AlertTitle>
					</Alert>
				) : null}

				{showPassword ? <PasswordSignIn /> : null}

				<div className="flex flex-col gap-3">
					{showSso ? <SsoSignIn providers={providers} /> : null}
					{social.map((provider, index) => (
						<SocialSignIn
							key={provider}
							provider={provider}
							only={socialLeads && index === 0}
						/>
					))}
				</div>
			</FormCard>
		</>
	);
}
