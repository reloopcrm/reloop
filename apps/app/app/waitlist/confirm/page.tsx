import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmWaitlist } from "@/components/landing/confirm-waitlist";
import { LandingShell } from "@/components/landing/landing-shell";

export const metadata: Metadata = {
	title: "Confirm your email",
	robots: { index: false },
};

export default function ConfirmWaitlistPage({
	searchParams,
}: PageProps<"/waitlist/confirm">) {
	return (
		<LandingShell>
			<main className="flex w-full max-w-(--container-narrow) flex-1 flex-col gap-6 px-6 py-20">
				<Suspense fallback={null}>
					<Confirm searchParams={searchParams} />
				</Suspense>
			</main>
		</LandingShell>
	);
}

async function Confirm({
	searchParams,
}: Pick<PageProps<"/waitlist/confirm">, "searchParams">) {
	const { token } = await searchParams;

	return <ConfirmWaitlist token={[token].flat()[0] ?? ""} />;
}
