"use client";

import type { PlanPurchase } from "@crm/db/pricing";
import { Button } from "@crm/ui/components/button";
import { Link } from "@crm/ui/components/link";
import NextLink from "next/link";
import { toast } from "sonner";
import { CheckoutButton } from "@/components/checkout-banner";
import { useT } from "@/lib/i18n/client";
import { signOutAndRedirect } from "@/lib/sign-out";

export type SignedInEntry =
	| { kind: "workspace" }
	| { kind: "refused" }
	| { kind: "owned"; purchase: PlanPurchase }
	| { kind: "checkout"; purchase: PlanPurchase }
	| { kind: "change"; href: string };

export type SignedInPanelProps = {
	entry: SignedInEntry;
	plan: string | null;
	workspace: string;
	workspaceHref: string;
	returnTo: string;
};

export function SignedInPanel({
	entry,
	plan,
	workspace,
	workspaceHref,
	returnTo,
}: SignedInPanelProps) {
	const t = useT();
	const book = plan
		? t("Book {plan} for {workspace}", { plan: t(plan), workspace })
		: null;
	const open = t("Go to my workspace");

	return (
		<>
			<div className="flex flex-col gap-3">
				{entry.kind === "checkout" ? (
					<CheckoutButton purchase={entry.purchase}>{book}</CheckoutButton>
				) : entry.kind === "change" ? (
					<Button asChild>
						<NextLink href={entry.href}>{book}</NextLink>
					</Button>
				) : null}
				<Button
					asChild
					variant={
						entry.kind === "checkout" || entry.kind === "change"
							? "outline"
							: "default"
					}
				>
					<NextLink href={workspaceHref}>{open}</NextLink>
				</Button>
			</div>
			<p className="text-pretty text-muted-foreground text-sm/5">
				{t("Create a new, separate workspace?")}{" "}
				<Link asChild>
					<button
						type="button"
						onClick={() => {
							signOutAndRedirect(returnTo).catch(() =>
								toast.error(t("Could not sign out.")),
							);
						}}
					>
						{t("Sign out first.")}
					</button>
				</Link>
			</p>
		</>
	);
}
