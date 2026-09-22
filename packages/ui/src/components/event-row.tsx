import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const COLUMNS =
	"grid grid-cols-[var(--event-time)_1rem_var(--event-who)_minmax(0,1fr)_0.75rem] items-center gap-x-2";

const PANEL_INSET =
	"ms-[calc(var(--event-time)+var(--event-who)+2.5rem)] me-5 max-md:mx-0";

export type EventVoice =
	| "inbound"
	| "outbound"
	| "note"
	| "call"
	| "meeting"
	| "task"
	| "task-overdue"
	| "task-done"
	| "system";

const VOICE_TONE: Record<
	EventVoice,
	{ time: string; who: string; subject: string; preview: string }
> = {
	inbound: {
		time: "",
		who: "font-medium text-foreground",
		subject: "font-medium text-body-foreground",
		preview: "",
	},
	outbound: {
		time: "",
		who: "text-muted-foreground",
		subject: "text-muted-foreground",
		preview: "",
	},
	note: {
		time: "",
		who: "text-muted-foreground",
		subject: "font-medium text-body-foreground",
		preview: "text-body-foreground",
	},
	call: {
		time: "",
		who: "text-muted-foreground",
		subject: "font-medium text-body-foreground",
		preview: "text-body-foreground",
	},
	meeting: {
		time: "",
		who: "text-muted-foreground",
		subject: "font-medium text-body-foreground",
		preview: "",
	},
	task: {
		time: "",
		who: "text-muted-foreground",
		subject: "font-medium text-body-foreground",
		preview: "",
	},
	"task-overdue": {
		time: "text-destructive",
		who: "text-muted-foreground",
		subject: "font-medium text-body-foreground",
		preview: "font-medium text-destructive",
	},
	"task-done": {
		time: "",
		who: "text-muted-foreground",
		subject: "text-faint-foreground line-through",
		preview: "text-faint-foreground",
	},
	system: {
		time: "text-faint-foreground",
		who: "font-mono text-faint-foreground text-xs",
		subject: "text-faint-foreground",
		preview: "text-faint-foreground",
	},
};

const markVariants = cva("block shrink-0 justify-self-center rounded-xs", {
	variants: {
		kind: {
			inbound: "size-2 bg-body-foreground",
			outbound: "size-2 border border-muted-foreground",
			note: "h-1 w-2.5 bg-muted-foreground",
			call: "size-2.5 rounded-full border border-muted-foreground",
			meeting: "size-2.5 border border-muted-foreground border-t-2",
			task: "size-2.5 border border-border-strong",
			"task-overdue": "size-2.5 border border-destructive",
			system: "size-1 bg-faint-foreground",
		},
	},
	defaultVariants: { kind: "system" },
});

function EventMark({
	kind,
	className,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof markVariants>) {
	return (
		<span
			data-slot="event-mark"
			aria-hidden="true"
			className={cn(markVariants({ kind }), className)}
			{...props}
		/>
	);
}

function EventList({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="event-list"
			className={cn(
				"flex shrink-0 flex-col px-5 pb-4 [--event-time:3.5rem] [--event-who:8rem] max-md:[--event-time:3.25rem] max-md:[--event-who:5.75rem]",
				className,
			)}
			{...props}
		/>
	);
}

function EventDayStrip({
	label,
	note,
	tone = "past",
}: {
	label: React.ReactNode;
	note?: React.ReactNode;
	tone?: "past" | "pending";
}) {
	return (
		<h3
			data-slot="event-day-strip"
			data-tone={tone}
			className="sticky top-0 z-10 flex h-6 items-center justify-between gap-2 bg-popover font-normal"
		>
			<span
				className={cn(
					"truncate font-mono text-xs",
					tone === "pending"
						? "text-muted-foreground"
						: "text-faint-foreground",
				)}
			>
				{label}
			</span>
			{note ? (
				<span className="shrink-0 font-mono text-faint-foreground text-xs tabular-nums">
					{note}
				</span>
			) : null}
		</h3>
	);
}

function EventGroup({
	pending = false,
	label,
	note,
	className,
	children,
	...props
}: React.ComponentProps<"div"> & {
	pending?: boolean;
	label?: React.ReactNode;
	note?: React.ReactNode;
}) {
	return (
		<section
			data-slot="event-day"
			className="mt-2 border-border-strong border-t first:mt-0 first:border-t-0"
		>
			{label === undefined ? null : (
				<EventDayStrip
					label={label}
					note={note}
					tone={pending ? "pending" : "past"}
				/>
			)}
			<div
				data-slot="event-group"
				className={cn(
					pending && "border-border-strong border-l border-dashed",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</section>
	);
}

function EventRow({
	voice,
	time,
	mark,
	who,
	subject,
	preview,
	panel,
	onOpen,
	defaultOpen = false,
	anchorId,
	className,
	...props
}: {
	voice: EventVoice;
	time: React.ReactNode;
	mark: React.ReactNode;
	who: React.ReactNode;
	subject?: React.ReactNode;
	preview?: React.ReactNode;
	panel?: React.ReactNode;
	onOpen?: () => void;
	defaultOpen?: boolean;
	anchorId?: string;
	className?: string;
	"data-demo"?: string;
}) {
	const tone = VOICE_TONE[voice];

	const cells = (
		<>
			<span
				className={cn(
					"truncate text-right font-mono text-muted-foreground text-xs tabular-nums",
					tone.time,
				)}
			>
				{time}
			</span>
			{mark}
			<span className={cn("truncate", tone.who)}>{who}</span>
			<span className="min-w-0 truncate text-muted-foreground">
				{subject ? <span className={tone.subject}>{subject}</span> : null}
				{subject && preview ? (
					<span className="mx-1 text-faint-foreground">·</span>
				) : null}
				{preview ? <span className={tone.preview}>{preview}</span> : null}
			</span>
			<span aria-hidden="true" className="justify-self-center">
				{panel ? (
					<Icon
						icon={ChevronDown}
						motion="none"
						className="size-3 text-faint-foreground opacity-40 transition-transform group-hover/event:opacity-100 group-open/event:rotate-180 group-open/event:opacity-100 pointer-coarse:opacity-100"
					/>
				) : null}
			</span>
		</>
	);

	if (!panel) {
		return (
			<div
				data-slot="event-row"
				data-voice={voice}
				id={anchorId}
				className={cn(
					COLUMNS,
					"h-7 scroll-mt-8 rounded-md text-sm hover:bg-muted max-md:h-11",
					className,
				)}
				{...props}
			>
				{cells}
			</div>
		);
	}

	return (
		<details
			data-slot="event-row"
			data-voice={voice}
			id={anchorId}
			{...(defaultOpen ? { open: true } : {})}
			className={cn(
				"group/event scroll-mt-8 rounded-md text-sm open:my-1 open:bg-muted",
				className,
			)}
			onToggle={(event) => {
				if (event.currentTarget.open) onOpen?.();
			}}
		>
			<summary
				className={cn(
					COLUMNS,
					"h-7 cursor-pointer list-none rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 group-open/event:hover:bg-transparent max-md:h-11 [&::-webkit-details-marker]:hidden",
				)}
				{...props}
			>
				{cells}
			</summary>
			<div
				data-slot="event-panel"
				className={cn(PANEL_INSET, "mb-2 border-border border-t pt-3")}
			>
				{panel}
			</div>
		</details>
	);
}

export { EventGroup, EventList, EventMark, EventRow };
