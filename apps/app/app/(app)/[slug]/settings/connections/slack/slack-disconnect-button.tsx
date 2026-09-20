"use client";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function SlackDisconnectButton({
	canManage,
	workspace,
}: {
	canManage: boolean;
	workspace: string | null;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const router = useRouter();
	const [confirming, setConfirming] = useState(false);
	const disconnect = useMutation(
		trpc.slack.disconnect.mutationOptions({
			onSuccess: async () => {
				await cache.slack();
				setConfirming(false);
				toast.success(t("Slack disconnected."));
				router.refresh();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);
	const disconnectAction = useAsyncAction({
		action: () => disconnect.mutateAsync(),
	});

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setConfirming(true)}
				disabled={!canManage || disconnectAction.pending}
			>
				{t("Disconnect")}
			</Button>

			<AlertDialog
				open={confirming}
				onOpenChange={(open) => {
					if (!disconnectAction.pending) setConfirming(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("Disconnect {workspace}?", {
								workspace: workspace ?? "Slack",
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"Agents stop sending to Slack at once. Who is matched to which Slack account is kept, so the same workspace asks you nothing again.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={disconnectAction.pending}>
							{t("Cancel")}
						</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={disconnectAction.pending}
							onClick={() => void disconnectAction.run()}
						>
							<AsyncButtonContent
								status={disconnectAction.status}
								pendingLabel={t("Disconnecting…")}
							>
								{t("Disconnect")}
							</AsyncButtonContent>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
