"use client";

import { Button } from "@crm/ui/components/button";
import { Link } from "@crm/ui/components/link";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

function Message({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<>
			<h1 className="font-medium text-3xl tracking-tight">{title}</h1>
			<p className="text-body-foreground text-sm/6">{children}</p>
		</>
	);
}

export function ConfirmWaitlist({ token }: { token: string }) {
	const trpc = useTRPC();
	const confirm = useMutation(trpc.waitlist.confirm.mutationOptions());

	if (!token || confirm.data?.confirmed === false) {
		return (
			<Message title="This link does not work">
				Join again on the <Link href="/get-started">Get started</Link> page to
				get a new one.
			</Message>
		);
	}

	if (confirm.data?.confirmed) {
		return (
			<Message title="You are on the list">
				We email you once when Reloop CRM Cloud opens.
			</Message>
		);
	}

	return (
		<>
			<Message title="Confirm your email">
				Click the button to join the Reloop CRM Cloud waitlist.
			</Message>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={confirm.isPending}
					onClick={() => confirm.mutate({ token })}
				>
					{confirm.isPending ? <Spinner data-icon="inline-start" /> : null}
					Confirm my email
				</Button>
				{confirm.isError ? (
					<p role="status" className="text-muted-foreground text-xs">
						That did not work. Try again in a minute.
					</p>
				) : null}
			</div>
		</>
	);
}
