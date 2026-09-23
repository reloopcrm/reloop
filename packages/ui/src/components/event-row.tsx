import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const COLUMNS =
	"grid grid-cols-[var(--event-time)_0.75rem_minmax(0,1fr)_1rem] items-baseline gap-x-2.5";

const PANEL_INSET = "ms-[calc(var(--event-time)+1.375rem)] me-4 max-md:mx-0";

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
		subject: "text-foreground",
		preview: "",
	},
	outbound: {
		time: "",
		who: "text-body-foreground",
		subject: "text-foreground",
		preview: "",
	},
	note: {
		time: "",
		who: "text-body-foreground",
		subject: "text-foreground",
		preview: "text-body-foreground",
	},
	call: {
		time: "",
		who: "text-body-foreground",
		subject: "text-foreground",
		preview: "text-body-foreground",
	},
	meeting: {
		time: "",
		who: "text-body-foreground",
		subject: "text-foreground",
		preview: "",
	},
	task: {
		time: "",
		who: "text-body-foreground",
		subject: "text-foreground",
		preview: "",
	},
	"task-overdue": {
		time: "text-destructive",
		who: "text-body-foreground",
		subject: "text-foreground",
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
		who: "text-faint-foreground",
		subject: "text-faint-foreground",
		preview: "text-faint-foreground",
	},
};

const markVariants = cva(
	"block size-2 shrink-0 self-center justify-self-center rounded-full",
	{
		variants: {
			kind: {
				inbound: "bg-primary",
				outbound: "bg-border-strong",
				note: "bg-border-strong",
				call: "border border-muted-foreground",
				meeting: "bg-border-strong",
				task: "border border-border-strong",
				"task-overdue": "border border-destructive",
				system: "size-1.5 bg-faint-foreground",
			},
		},
		defaultVariants: { kind: "system" },
	},
);

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
				"flex shrink-0 flex-col px-5 pt-2 pb-4 [--event-time:2.75rem]",
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
			className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-popover pt-2 pb-0.5 font-normal text-muted-foreground text-xs"
		>
			<span className="truncate">{label}</span>
			{note ? (
				<span className="shrink-0 text-xs tabular-nums">{note}</span>
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
		<section data-slot="event-day">
			{label === undefined ? null : (
				<EventDayStrip
					label={label}
					note={note}
					tone={pending ? "pending" : "past"}
				/>
			)}
			<div data-slot="event-group" className={className} {...props}>
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
					"truncate text-muted-foreground text-xs tabular-nums",
					tone.time,
				)}
			>
				{time}
			</span>
			{mark}
			<span className="min-w-0 truncate text-muted-foreground">
				<span className={tone.who}>{who}</span>
				{subject ? (
					<span className={cn("ms-2.5", tone.subject)}>{subject}</span>
				) : null}
				{preview ? (
					<span className={tone.preview}>
						{" · "}
						{preview}
					</span>
				) : null}
			</span>
			<span aria-hidden="true" className="justify-self-center">
				{panel ? (
					<Icon
						icon={ChevronDown}
						motion="none"
						className="size-3 text-muted-foreground opacity-60 transition-transform group-hover/event:opacity-100 group-open/event:rotate-180 group-open/event:opacity-100 pointer-coarse:opacity-100"
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
					"scroll-mt-8 rounded-md py-2 text-sm hover:bg-muted",
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
					"cursor-pointer list-none rounded-md py-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 group-open/event:hover:bg-transparent [&::-webkit-details-marker]:hidden",
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
