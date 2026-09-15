import { Button } from "@crm/ui/components/button";
import { Link } from "@crm/ui/components/link";
import Wordmark from "@crm/ui/components/wordmark";
import NextLink from "next/link";
import type * as React from "react";
import { REPO_URL } from "./site";

export function LandingShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="dark flex min-h-svh w-full flex-col items-center overflow-clip bg-background font-sans text-foreground">
			<header className="relative flex h-16 w-full shrink-0 items-center justify-center border-border border-b">
				<nav className="flex w-full max-w-6xl items-center gap-4 px-6 text-[13px]/6">
					<NextLink href="/" aria-label="Reloop CRM home">
						<Wordmark className="h-5 w-auto" />
					</NextLink>
					<div className="grow" />
					<Link variant="quiet" href="/docs">
						Docs
					</Link>
					<Link variant="quiet" href="/get-started">
						Get started
					</Link>
					<Link
						variant="quiet"
						href={REPO_URL}
						target="_blank"
						rel="noreferrer"
					>
						GitHub
					</Link>
					<Button variant="outline" size="sm" asChild>
						<NextLink href="/sign-in">Sign in</NextLink>
					</Button>
				</nav>
			</header>

			{children}

			<footer className="relative flex w-full shrink-0 flex-col items-center border-border border-t">
				<div className="flex w-full max-w-6xl flex-col items-start justify-between gap-12 px-6 py-16 sm:flex-row sm:gap-16">
					<div className="flex w-[280px] max-w-full shrink-0 flex-col gap-[14px]">
						<Wordmark className="h-5 w-auto" />
						<p className="text-[13px]/[21px] text-muted-foreground">
							The open-source, self-hosted CRM.
						</p>
					</div>

					<nav className="flex w-[180px] shrink-0 flex-col items-start gap-[14px] text-[13px]/6">
						<Link variant="quiet" href="/docs">
							Docs
						</Link>
						<Link variant="quiet" href="/get-started">
							Get started
						</Link>
						<Link
							variant="quiet"
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
						>
							GitHub
						</Link>
						<Link variant="quiet" href="/open-source">
							Open source
						</Link>
						<Link variant="quiet" href="/sign-in">
							Sign in
						</Link>
					</nav>
				</div>
			</footer>
		</div>
	);
}
