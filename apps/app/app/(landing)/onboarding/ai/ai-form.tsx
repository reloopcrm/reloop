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
import { ChatgptDeviceLogin } from "@/app/(app)/[slug]/settings/ai/chatgpt-device-login";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { CONNECTIONS_PATH } from "@/lib/onboarding";
import { useTRPC } from "@/lib/trpc/client";
import { AI_STEP, type AiChoice, type AiStep } from "./ai-config";

type KeyedChoice = Exclude<AiChoice, "chatgpt">;

export function AiForm({ step }: { step: Exclude<AiStep, "hidden"> }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const router = useRouter();
	const keyId = useId();
	const choices = AI_STEP.choices[step];
	const [choice, setChoice] = useState<AiChoice>(choices[0]);

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
					const picked = choices.find((entry) => entry === value);
					if (picked) setChoice(picked);
				}}
			>
				{choices.map((entry) => (
					<ToggleGroupItem key={entry} value={entry}>
						{t(AI_STEP.labels[entry])}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			{choice === "chatgpt" ? (
				<div className="flex flex-col gap-3">
					<div>
						<Badge variant="outline">{t("Experimental")}</Badge>
					</div>
					<p className="text-muted-foreground text-xs">
						{t(
							"Uses the ChatGPT plan you already pay for. OpenAI can change or withdraw this at any time.",
						)}
					</p>
					<ChatgptDeviceLogin onConnected={next} />
				</div>
			) : (
				<KeyForm
					key={choice}
					choice={choice}
					keyId={keyId}
					pending={save.isPending}
					onSubmit={(apiKey) =>
						save.mutate({ provider: choice, [`${choice}Key`]: apiKey })
					}
				/>
			)}

			<Button
				type="button"
				variant="outline"
				disabled={save.isPending}
				onClick={next}
			>
				{t("Continue without AI")}
			</Button>
		</div>
	);
}

function KeyForm({
	choice,
	keyId,
	pending,
	onSubmit,
}: {
	choice: KeyedChoice;
	keyId: string;
	pending: boolean;
	onSubmit: (apiKey: string) => void;
}) {
	const t = useT();

	return (
		<form
			className="flex flex-col gap-6"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit(
					String(new FormData(event.currentTarget).get("apiKey") ?? "").trim(),
				);
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={keyId}>{t(AI_STEP.labels[choice])}</FieldLabel>
					<Input
						id={keyId}
						name="apiKey"
						type="password"
						placeholder={t(AI_STEP.placeholders[choice])}
						autoComplete="off"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						required
						autoFocus
					/>
					<FieldDescription>
						{t(
							"The agent checks the key before it is saved. It is stored encrypted and never shown again.",
						)}
					</FieldDescription>
				</Field>
			</FieldGroup>
			<Button type="submit" disabled={pending}>
				{pending ? <Spinner data-icon="inline-start" /> : null}
				{t("Continue")}
			</Button>
		</form>
	);
}
