"use client";

import DataTable from "@carbon/icons-react/es/DataTable";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const SAMPLE_DATA = {
	statusStaleMs: 5 * 60 * 1000,
} as const;

function useSampleDataStatus() {
	const trpc = useTRPC();

	return useQuery({
		...trpc.sampleData.status.queryOptions(),
		staleTime: SAMPLE_DATA.statusStaleMs,
	});
}

export function LoadSampleData() {
	const t = useT();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const router = useRouter();
	const errorMessage = useErrorMessage();
	const status = useSampleDataStatus();
	const [confirming, setConfirming] = useState(false);

	const load = useMutation(
		trpc.sampleData.load.mutationOptions({
			onSuccess: async () => {
				await cache.everything();
				setConfirming(false);
				router.refresh();
				toast.success(t("The sample data is in. Have a look around."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const loadAction = useAsyncAction({ action: () => load.mutateAsync() });

	if (!status.data?.loadable) return null;

	return (
		<>
			<Button
				variant="secondary"
				disabled={loadAction.pending}
				onClick={() => setConfirming(true)}
			>
				{t("Look around with sample data")}
			</Button>

			<AlertDialog
				open={confirming}
				onOpenChange={(open) => {
					if (!loadAction.pending) setConfirming(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("Write the sample data?")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"This writes made up companies, people, deals and mail into this workspace. They count in every total until you remove them again from the banner at the top.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={loadAction.pending}>
							{t("Cancel")}
						</AlertDialogCancel>
						<Button
							variant="secondary"
							disabled={loadAction.pending}
							aria-busy={loadAction.pending}
							onClick={() => loadAction.run()}
						>
							<AsyncButtonContent
								status={loadAction.status}
								pendingLabel={t("Writing the sample data")}
								successLabel={t("Ready")}
								errorLabel={t("Try again")}
							>
								{t("Write the sample data")}
							</AsyncButtonContent>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export function SampleDataBanner() {
	const t = useT();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const router = useRouter();
	const errorMessage = useErrorMessage();
	const status = useSampleDataStatus();
	const [confirming, setConfirming] = useState(false);

	const remove = useMutation(
		trpc.sampleData.remove.mutationOptions({
			onSuccess: async () => {
				await cache.everything();
				setConfirming(false);
				router.refresh();
				toast.success(t("The sample data is gone."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const removeAction = useAsyncAction({ action: () => remove.mutateAsync() });

	if (!status.data?.present) return null;

	return (
		<div className="border-b px-6 py-2">
			<Alert>
				<DataTable />
				<AlertTitle>{t("This CRM shows sample data")}</AlertTitle>
				<AlertDescription>
					{t(
						"The companies, people, deals and mail here are made up. They count in every total, so remove them before you read a number as real.",
					)}
				</AlertDescription>
				{status.data.canManage ? (
					<AlertAction>
						<Button
							size="sm"
							variant="secondary"
							disabled={removeAction.pending}
							onClick={() => setConfirming(true)}
						>
							{t("Remove sample data")}
						</Button>
					</AlertAction>
				) : null}
			</Alert>

			<AlertDialog
				open={confirming}
				onOpenChange={(open) => {
					if (!removeAction.pending) setConfirming(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("Remove the sample data?")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"This deletes the sample rows and nothing else. Every company, person, deal and mail you brought here yourself stays.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removeAction.pending}>
							{t("Cancel")}
						</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={removeAction.pending}
							aria-busy={removeAction.pending}
							onClick={() => removeAction.run()}
						>
							<AsyncButtonContent
								status={removeAction.status}
								pendingLabel={t("Removing")}
								successLabel={t("Removed")}
								errorLabel={t("Try again")}
							>
								{t("Remove sample data")}
							</AsyncButtonContent>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
