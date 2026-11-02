import type { ReactNode } from "react";
import { AuthSplit, AuthTitle } from "@/components/landing/mailcheap/auth";
import { BrowserFrame } from "@/components/landing/mailcheap/browser";
import { LANDING } from "@/components/landing/mailcheap/config";
import { Shot } from "@/components/landing/mailcheap/shot";
import { getT } from "@/lib/i18n/server";
import { marketingUrl } from "@/lib/site-links";

export async function AuthShell({ children }: { children: ReactNode }) {
	const t = await getT();

	return (
		<AuthSplit
			home={{ href: marketingUrl("/"), label: t("Reloop CRM home") }}
			aside={{
				kicker: t("Win back"),
				title: t("Bring your mailbox. Find the customers."),
				body: t(
					"The open source CRM that reads your email history and tells you which past customers are worth winning back.",
				),
				shot: (
					<BrowserFrame url={LANDING.auth.exampleAddress}>
						<Shot
							name={LANDING.shots.auth.signIn}
							sizes={LANDING.shots.sizes.aside}
						/>
					</BrowserFrame>
				),
			}}
		>
			{children}
		</AuthSplit>
	);
}

export function AuthHeading({
	title,
	description,
}: {
	title: ReactNode;
	description: ReactNode;
}) {
	return <AuthTitle title={title} intro={<p>{description}</p>} />;
}
