"use client";

import Calendar from "@carbon/icons-react/es/Calendar";
import { Calendar as DayPicker } from "@crm/ui/components/calendar";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@crm/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { activityLabel } from "@/lib/activity-presentation";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import { dateFormat } from "@/lib/i18n/format";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ActivityIcon } from "./activity-icon";
import type { TimelineAnchor } from "./timeline";

const TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const;

type ComposableType = (typeof TYPES)[number];

const DUE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
};

const PLACEHOLDER = {
	NOTE: "Log a note, call, email, meeting or task…",
	CALL: "What came out of the call?",
	EMAIL: "What was said?",
	MEETING: "What came out of the meeting?",
	TASK: "What needs doing?",
} satisfies Record<ComposableType, string>;

const LOG_LABEL = {
	NOTE: "Log note",
	CALL: "Log call",
	EMAIL: "Log email",
	MEETING: "Log meeting",
	TASK: "Log task",
} satisfies Record<ComposableType, string>;

export function ActivityComposer({ anchor }: { anchor: TimelineAnchor }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const locale = useLocale();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [type, setType] = useState<ComposableType>("NOTE");
	const [draft, setDraft] = useState("");
	const [dueAt, setDueAt] = useState<Date | undefined>(undefined);

	const isTask = type === "TASK";
	const text = draft.trim();

	const reset = () => {
		setDraft("");
		setDueAt(undefined);
	};

	const create = useMutation(
		trpc.activities.create.mutationOptions({
			onSuccess: async () => {
				await cache.activity();
				reset();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const submit = () => {
		if (text === "" || create.isPending) return;
		create.mutate({
			...anchor,
			type,
			subject: isTask ? text : undefined,
			body: isTask ? undefined : text,
			dueAt: isTask ? (dueAt?.toISOString() ?? null) : undefined,
		});
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<InputGroup>
				<InputGroupTextarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={t(PLACEHOLDER[type])}
					aria-label={t("What happened")}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							submit();
						}
					}}
				/>

				<InputGroupAddon align="block-end" className="gap-2 border-t">
					<ToggleGroup
						type="single"
						wrap
						value={type}
						onValueChange={(next) => next && setType(next as ComposableType)}
						size="sm"
						spacing={0}
					>
						{TYPES.map((option) => (
							<ToggleGroupItem
								key={option}
								value={option}
								aria-label={t(activityLabel(option))}
							>
								<ActivityIcon type={option} />
								{t(activityLabel(option))}
							</ToggleGroupItem>
						))}
					</ToggleGroup>

					{isTask ? (
						<Popover>
							<PopoverTrigger asChild>
								<InputGroupButton variant="ghost" size="xs">
									<Icon icon={Calendar} data-icon="inline-start" />
									{dueAt
										? dateFormat(locale, DUE_OPTIONS).format(dueAt)
										: t("Due date")}
								</InputGroupButton>
							</PopoverTrigger>
							<PopoverContent size="fit" align="start">
								<DayPicker
									mode="single"
									selected={dueAt}
									onSelect={setDueAt}
									autoFocus
								/>
							</PopoverContent>
						</Popover>
					) : null}

					{text === "" ? null : (
						<InputGroupButton
							type="submit"
							variant="outline"
							size="xs"
							className="ml-auto"
							disabled={create.isPending}
						>
							{create.isPending ? <Spinner /> : null}
							{isTask ? t("Add task") : t(LOG_LABEL[type])}
						</InputGroupButton>
					)}
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
