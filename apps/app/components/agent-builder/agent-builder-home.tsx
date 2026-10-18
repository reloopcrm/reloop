"use client";

import { OpenIcon } from "@crm/ui/components/line-icons";
import { MonoLabel } from "@crm/ui/components/mark";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { AgentComposer, type BuilderComposerPrompt } from "./agent-composer";

const SUGGESTIONS = [
	"Brief every deal owner before a renewal call",
	"Flag deals with no activity for 14 days",
	"Hand new customers from Sales to Onboarding",
];

export function AgentBuilderHome({ name }: { name: string }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [initialPrompt, setInitialPrompt] = useState("");
	const create = useMutation(
		trpc.conversations.createBuilder.mutationOptions({
			onSuccess: async ({ id }) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.conversations.builderList.pathKey(),
				});
				router.push(workspaceUrl(`/chat/${id}`));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const submit = async (
		prompt: BuilderComposerPrompt,
		clientRequestId: string,
	) => {
		await create.mutateAsync({
			...prompt,
			clientRequestId,
		});
	};

	return (
		<main
			data-slot="chat-home"
			className="relative flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-12 pb-20 sm:px-6 md:justify-center md:pb-28"
		>
			<div className="flex w-full max-w-160 flex-col items-center gap-3 pb-6 text-center">
				<h1 className="text-balance text-2xl tracking-tight">
					{t("What can I help with, {name}?", {
						name: firstName(name) || t("there"),
					})}
				</h1>
				<p className="max-w-105 text-balance font-light font-serif text-body-foreground text-md">
					{t(
						"Ask about your CRM, tag a record or integration, or describe an agent to build to automate a task.",
					)}
				</p>
			</div>

			<div className="w-full max-w-160">
				<AgentComposer
					key={initialPrompt}
					mode="home"
					initialPrompt={initialPrompt}
					onSubmit={submit}
				/>
				<p className="py-2 text-muted-foreground text-xs">
					{t(
						"Chats and agent drafts stay private to you. Deploying an agent makes it available to the whole team.",
					)}
				</p>

				<div className="flex flex-col gap-2 pt-6">
					<MonoLabel>{t("Suggested agents")}</MonoLabel>
					<div className="flex flex-col border-b">
						{SUGGESTIONS.map((suggestion) => (
							<button
								key={suggestion}
								type="button"
								onClick={() =>
									setInitialPrompt(`/Create agent ${t(suggestion)}`)
								}
								className="flex h-11 w-full items-center gap-3 border-t text-left outline-none transition-colors hover:bg-active focus-visible:bg-active"
							>
								<span className="min-w-0 flex-1 truncate text-sm">
									{t(suggestion)}
								</span>
								<OpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
							</button>
						))}
					</div>
				</div>
			</div>
		</main>
	);
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] ?? "";
}
