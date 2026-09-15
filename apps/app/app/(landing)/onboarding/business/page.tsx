import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireMailboxAccess } from "@/lib/session";
import { BusinessForm } from "./business-form";

export const metadata: Metadata = { title: "Your business" };

export const instant = false;

export default async function BusinessPage() {
	await requireMailboxAccess();

	return (
		<AuthShell>
			<AuthHeading
				title="Your business"
				description="What you sell and what a big order looks like. The agent ranks old contacts by it and learns more from your mail later."
			/>

			<BusinessForm />
		</AuthShell>
	);
}
