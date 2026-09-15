"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { CopyValue } from "./copy-value";

export function ChatgptDeviceLogin({
	onConnected,
	primary = true,
}: {
	onConnected: () => void;
	primary?: boolean;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [active, setActive] = useState(false);

	const status = useQuery({
		...trpc.settings.chatgptLogin.queryOptions(),
		enabled: active,
		refetchInterval: (query) =>
			query.state.data?.status === "waiting" ? query.state.data.pollMs : false,
		refetchIntervalInBackground: true,
	});

	const action = useMutation(
		trpc.settings.chatgptLoginAction.mutationOptions({
			onSuccess: (data) => {
				queryClient.setQueryData(trpc.settings.chatgptLogin.queryKey(), data);
				setActive(data.status === "waiting" || data.status === "connected");
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const login = status.data;

	useEffect(() => {
		if (active && login?.status === "connected") {
			setActive(false);
			onConnected();
		}
	}, [active, login?.status, onConnected]);

	const busy = action.isPending;

	if (login?.status === "waiting") {
		return (
			<div className="flex flex-col gap-3">
				{login.url && login.code ? (
					<>
						<p className="text-sm">
							{t("1. Open this link and sign in to ChatGPT:")}{" "}
							<a
								href={login.url}
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-4 hover:text-foreground"
							>
								{login.url}
							</a>
						</p>
						<div className="flex items-center gap-2 text-sm">
							<span>{t("2. Enter this code:")}</span>
							<span className="font-mono">{login.code}</span>
							<CopyValue value={login.code} label="Code" />
						</div>
						<p className="flex items-center gap-2 text-muted-foreground text-xs">
							<Spinner />
							{t("Waiting for you to finish the sign-in.")}
						</p>
					</>
				) : (
					<p className="flex items-center gap-2 text-muted-foreground text-xs">
						<Spinner />
						{t("Starting the ChatGPT sign-in.")}
					</p>
				)}
				<div>
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={() => action.mutate({ action: "cancel" })}
					>
						{t("Cancel")}
					</Button>
				</div>
			</div>
		);
	}

	if (login?.status === "connected") {
		return (
			<p className="text-muted-foreground text-xs">
				{login.alreadyLoggedIn
					? t("The agent's machine is already signed in to ChatGPT.")
					: t("Signed in to ChatGPT.")}
			</p>
		);
	}

	const problem =
		login?.status === "timeout"
			? t("The code expired before the sign-in finished.")
			: login?.status === "cancelled"
				? t("The sign-in was cancelled.")
				: login?.status === "failed" || login?.status === "unavailable"
					? (login.reason ?? t("The sign-in did not work."))
					: null;

	return (
		<div className="flex flex-col gap-3">
			{problem ? (
				<p className="text-muted-foreground text-xs">{problem}</p>
			) : null}
			<div>
				<Button
					type="button"
					variant={primary ? "default" : "outline"}
					disabled={busy}
					onClick={() => action.mutate({ action: "start" })}
				>
					{busy ? <Spinner data-icon="inline-start" /> : null}
					{problem ? t("Try again") : t("Sign in with ChatGPT")}
				</Button>
			</div>
		</div>
	);
}
