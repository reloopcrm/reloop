import Wordmark from "@crm/ui/components/wordmark";
import { BRAND } from "@crm/ui/lib/brand";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthShader } from "@/components/auth-shader";
import { LanguageSwitcher } from "@/components/landing/language-switcher";
import { getT } from "@/lib/i18n/server";
import { marketingUrl } from "@/lib/site-links";

export async function AuthShell({ children }: { children: ReactNode }) {
	const t = await getT();

	return (
		<main className="dark grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
			<section className="relative hidden min-h-svh overflow-hidden bg-muted p-8 lg:flex lg:flex-col lg:justify-between xl:p-12">
				<AuthShader />

				<div className="relative flex gap-2 text-sm/5">
					<Link
						href={marketingUrl("/")}
						aria-label={t("Homepage")}
						className="flex"
					>
						<Wordmark className="h-5 w-auto shrink-0" />
					</Link>
				</div>

				<div className="relative flex max-w-lg flex-col gap-8">
					<div className="flex flex-col gap-4">
						<p className="font-mono text-xs/4 text-muted-foreground uppercase">
							{BRAND.name}
						</p>
						<h1 className="max-w-[14ch] text-5xl/14 font-semibold text-balance">
							{t(BRAND.tagline)}
						</h1>
					</div>
				</div>
			</section>

			<section className="flex min-h-svh flex-col bg-background px-6 py-8 sm:px-10 lg:px-14">
				<div className="flex flex-1 items-center justify-center py-12">
					<div className="flex w-full max-w-sm flex-col gap-8">{children}</div>
				</div>
				<div className="flex justify-center text-muted-foreground">
					<LanguageSwitcher />
				</div>
			</section>
		</main>
	);
}

export async function AuthHeading({
	title,
	description,
}: {
	title: ReactNode;
	description: ReactNode;
}) {
	const t = await getT();

	return (
		<div className="flex flex-col gap-3 text-left">
			<Link
				href={marketingUrl("/")}
				aria-label={t("Homepage")}
				className="flex"
			>
				<Wordmark className="h-5 w-auto shrink-0" />
			</Link>
			<div className="flex flex-col gap-1">
				<h2 className="text-2xl/8 font-semibold tracking-tight text-balance">
					{title}
				</h2>
				<p className="max-w-[32ch] text-sm/5 text-muted-foreground text-pretty">
					{description}
				</p>
			</div>
		</div>
	);
}
