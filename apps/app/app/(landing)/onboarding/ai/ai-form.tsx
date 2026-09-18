"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ChatgptDeviceLogin } from "@/app/(app)/[slug]/settings/chatgpt-device-login";
import { useErrorMessage } from "@/lib/i18n/client";
import { CONNECTIONS_PATH } from "@/lib/onboarding";
import { useTRPC } from "@/lib/trpc/client";

type Choice = "openai" | "anthropic" | "chatgpt";

const CHOICES: { id: Choice; label: string }[] = [
	{ id: "openai", label: "OpenAI API key" },
	{ id: "anthropic", label: "Anthropic API key" },
	{ id: "chatgpt", label: "ChatGPT subscription" },
];

export function AiForm() {
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const router = useRouter();
	const keyId = useId();
	const [choice, setChoice] = useState<Choice>("openai");

	const next = () => {
		router.refresh();
		router.replace(CONNECTIONS_PATH);
	};

	const save = useMutation(
		trpc.settings.setAgentProvider.mutationOptions({
			onSuccess: next,
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<div className="flex flex-col gap-6">
			<ToggleGroup
				type="single"
				wrap
				value={choice}
				onValueChange={(value) => {
					const picked = CHOICES.find((entry) => entry.id === value);
					if (picked) setChoice(picked.id);
				}}
			>
				{CHOICES.map((entry) => (
					<ToggleGroupItem key={entry.id} value={entry.id}>
						{entry.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			{choice === "chatgpt" ? (
				<div className="flex flex-col gap-3">
					<div>
						<Badge variant="outline">Experimental</Badge>
					</div>
					<p className="text-muted-foreground text-xs">
						Uses the ChatGPT plan you already pay for. OpenAI can change or
						withdraw this at any time.
					</p>
					<ChatgptDeviceLogin onConnected={next} />
				</div>
			) : (
				<form
					key={choice}
					className="flex flex-col gap-6"
					onSubmit={(event) => {
						event.preventDefault();
						const apiKey = String(
							new FormData(event.currentTarget).get("apiKey") ?? "",
						).trim();
						save.mutate(
							choice === "openai"
								? { provider: "openai", openaiKey: apiKey }
								: { provider: "anthropic", anthropicKey: apiKey },
						);
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={keyId}>
								{choice === "openai" ? "OpenAI API key" : "Anthropic API key"}
							</FieldLabel>
							<Input
								id={keyId}
								name="apiKey"
								type="password"
								placeholder={
									choice === "openai"
										? "sk-… from platform.openai.com"
										: "sk-ant-… from console.anthropic.com"
								}
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								required
								autoFocus
							/>
							<FieldDescription>
								The agent checks the key before it is saved. It is stored
								encrypted and never shown again.
							</FieldDescription>
						</Field>
					</FieldGroup>
					<Button type="submit" disabled={save.isPending}>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Continue
					</Button>
				</form>
			)}

			<Button
				type="button"
				variant="outline"
				disabled={save.isPending}
				onClick={next}
			>
				Continue without AI
			</Button>
		</div>
	);
}
