import { MonoLabel, Square } from "@crm/ui/components/mark";
import { Skeleton } from "@crm/ui/components/skeleton";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { Check } from "lucide-react";
import type * as React from "react";

function SplitLayout({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="split-layout"
			className={cn(
				"grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-6 [grid-template-areas:'main'_'aside'_'foot'] split:grid-cols-[minmax(0,1fr)_var(--container-aside)] split:items-start split:[grid-template-areas:'main_aside'_'foot_aside']",
				className,
			)}
			{...props}
		/>
	);
}

function SplitMain({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="split-main"
			className={cn(
				"flex min-w-0 max-w-(--container-story) flex-col [grid-area:main]",
				className,
			)}
			{...props}
		/>
	);
}

function SplitAside({ className, ...props }: React.ComponentProps<"aside">) {
	return (
		<aside
			data-slot="split-aside"
			className={cn(
				"min-w-0 max-w-(--container-story) scroll-mt-16 [grid-area:aside] split:sticky split:top-4 split:max-h-[calc(100dvh-2rem)] split:overflow-y-auto",
				className,
			)}
			{...props}
		/>
	);
}

function SplitFoot({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="split-foot"
			className={cn(
				"min-w-0 max-w-(--container-story) [grid-area:foot]",
				className,
			)}
			{...props}
		/>
	);
}

function ActionBar({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="action-bar"
			className={cn(
				"fixed inset-x-0 bottom-0 z-30 flex items-center gap-x-4 gap-y-2 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:left-(--container-sidebar) split:hidden [&>[data-slot=button]:first-child]:flex-1",
				className,
			)}
			{...props}
		/>
	);
}

function ActionBarSpacer({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			aria-hidden="true"
			data-slot="action-bar-spacer"
			className={cn("h-16 split:hidden", className)}
			{...props}
		/>
	);
}

type ProgressStep = { label: string; state: "done" | "current" | "next" };

function StoryProgress({
	steps,
	className,
	...props
}: React.ComponentProps<"ol"> & { steps: ProgressStep[] }) {
	return (
		<ol
			data-slot="story-progress"
			className={cn("flex flex-wrap gap-x-3.5 gap-y-1.5", className)}
			{...props}
		>
			{steps.map((step, index) => (
				<li
					key={step.label}
					aria-current={step.state === "current" ? "step" : undefined}
					data-state={step.state}
					className="inline-flex items-center gap-1.5 text-faint-foreground data-[state=current]:text-foreground data-[state=done]:text-muted-foreground"
				>
					<i aria-hidden="true" className="inline-block size-1.5 bg-current" />
					<MonoLabel className="text-current">
						{index + 1} {step.label}
					</MonoLabel>
				</li>
			))}
		</ol>
	);
}

function StoryName({ className, ...props }: React.ComponentProps<"h1">) {
	return (
		<h1
			data-slot="story-name"
			className={cn(
				"wrap-anywhere font-normal text-[22px] leading-tight tracking-tight",
				className,
			)}
			{...props}
		/>
	);
}

function StoryGist({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="story-gist"
			className={cn(
				"max-w-165 text-pretty font-light font-serif text-[19px] text-foreground leading-[1.35] lg:text-[22px]",
				className,
			)}
			{...props}
		/>
	);
}

type TrackMark = {
	key: string;
	position: number;
	kind: "order" | "mail";
	title: string;
};

function StoryTrack({
	heading,
	quietLabel,
	startLabel,
	endLabel,
	legend,
	from,
	until,
	marks,
	className,
	...props
}: Omit<React.ComponentProps<"div">, "title"> & {
	heading: string;
	quietLabel: string;
	startLabel: string;
	endLabel: string;
	legend: React.ReactNode;
	from: number;
	until: number;
	marks: TrackMark[];
}) {
	return (
		<div
			data-slot="story-track"
			className={cn("rounded-md border px-4 pt-3.5 pb-3", className)}
			{...props}
		>
			<div className="mb-3.5 flex flex-wrap justify-between gap-3">
				<MonoLabel>{heading}</MonoLabel>
				<MonoLabel className="text-foreground">{quietLabel}</MonoLabel>
			</div>
			<div className="relative mx-1.25 h-3.5">
				<i
					aria-hidden="true"
					className="absolute top-1.5 h-0.5 bg-foreground"
					style={{ left: `${from}%`, right: `${100 - until}%` }}
				/>
				<i
					aria-hidden="true"
					className="absolute top-1.5 right-0 h-0.5 bg-[repeating-linear-gradient(90deg,var(--ink-40)_0_4px,transparent_4px_8px)]"
					style={{ left: `${until}%` }}
				/>
				{marks.map((mark) => (
					<i
						key={mark.key}
						title={mark.title}
						data-kind={mark.kind}
						className="absolute top-0.5 h-2.5 w-0.5 -translate-x-1/2 bg-muted-foreground data-[kind=order]:z-10 data-[kind=order]:size-2.5 data-[kind=order]:bg-blue"
						style={{ left: `${mark.position}%` }}
					/>
				))}
				<i
					aria-hidden="true"
					className="absolute top-0.5 -right-1.25 size-2.5 rounded-full border-2 border-muted-foreground bg-background"
				/>
			</div>
			<div className="mt-2.5 flex flex-wrap justify-between gap-3 text-muted-foreground text-xs">
				<span>{startLabel}</span>
				<span className="inline-flex flex-wrap gap-3.5">{legend}</span>
				<span>{endLabel}</span>
			</div>
		</div>
	);
}

function StoryTrackKey({
	kind,
	children,
}: {
	kind: "order" | "mail";
	children: React.ReactNode;
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<i
				aria-hidden="true"
				data-kind={kind}
				className="inline-block h-2.5 w-0.5 bg-muted-foreground data-[kind=order]:size-2 data-[kind=order]:bg-blue"
			/>
			{children}
		</span>
	);
}

function StoryChapters({ className, ...props }: React.ComponentProps<"ol">) {
	return (
		<ol
			data-slot="story-chapters"
			className={cn("flex flex-col", className)}
			{...props}
		/>
	);
}

function StoryChapter({
	number,
	title,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"li">, "title"> & {
	number: string;
	title: React.ReactNode;
}) {
	return (
		<li
			data-slot="story-chapter"
			className={cn(
				"grid grid-cols-[minmax(0,1fr)] gap-1.5 border-b py-5.5 md:grid-cols-[32px_minmax(0,1fr)] md:gap-x-3 md:gap-y-0",
				className,
			)}
			{...props}
		>
			<MonoLabel className="pt-1 text-faint-foreground">{number}</MonoLabel>
			<div className="min-w-0">
				<h3 className="font-medium text-base leading-snug tracking-tight">
					{title}
				</h3>
				{children}
			</div>
		</li>
	);
}

const SKELETON_TITLES = ["w-2/5", "w-1/2", "w-1/3"] as const;

function StorySkeleton({ className, ...props }: React.ComponentProps<"ol">) {
	return (
		<ol
			data-slot="story-skeleton"
			aria-hidden="true"
			className={cn("flex flex-col", className)}
			{...props}
		>
			{SKELETON_TITLES.map((title) => (
				<li
					key={title}
					className="grid grid-cols-[minmax(0,1fr)] gap-1.5 border-b py-5.5 md:grid-cols-[32px_minmax(0,1fr)] md:gap-x-3 md:gap-y-0"
				>
					<Skeleton className="mt-1 h-3 w-4" />
					<div className="flex min-w-0 flex-col gap-2">
						<Skeleton className={cn("h-5", title)} />
						<Skeleton className="h-4 w-full max-w-155" />
						<Skeleton className="h-4 w-4/5 max-w-155" />
					</div>
				</li>
			))}
		</ol>
	);
}

function StoryStatus({
	className,
	children,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="story-status"
			role="status"
			className={cn(
				"flex items-start gap-2 text-2sm text-muted-foreground",
				className,
			)}
			{...props}
		>
			<Spinner aria-hidden="true" className="mt-px" />
			<span className="min-w-0">{children}</span>
		</p>
	);
}

function StoryText({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="story-text"
			className={cn(
				"mt-1.5 max-w-155 text-pretty text-body-foreground text-md [&+&]:mt-2.5",
				className,
			)}
			{...props}
		/>
	);
}

function StoryFacts({ className, ...props }: React.ComponentProps<"dl">) {
	return (
		<dl
			data-slot="story-facts"
			className={cn(
				"mt-3.5 grid max-w-140 grid-cols-3 rounded-md border md:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]",
				className,
			)}
			{...props}
		/>
	);
}

function StoryFact({
	label,
	children,
}: {
	label: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="min-w-0 border-r px-2.5 py-2 last:border-r-0 md:px-3 md:py-2.5">
			<dt>
				<MonoLabel>{label}</MonoLabel>
			</dt>
			<dd className="mt-1.5 wrap-anywhere text-foreground text-sm md:text-md">
				{children}
			</dd>
		</div>
	);
}

function StoryQuote({
	source,
	className,
	children,
	...props
}: React.ComponentProps<"blockquote"> & { source: React.ReactNode }) {
	return (
		<blockquote
			data-slot="story-quote"
			className={cn(
				"mt-3.5 max-w-150 border-foreground border-l-2 py-0.5 pl-4",
				className,
			)}
			{...props}
		>
			<p className="font-light font-serif text-[17px] text-foreground leading-[1.4] lg:text-[19px]">
				{children}
			</p>
			<cite className="mt-2 block not-italic">
				<MonoLabel>{source}</MonoLabel>
			</cite>
		</blockquote>
	);
}

function CheckList({ className, ...props }: React.ComponentProps<"ul">) {
	return (
		<ul
			data-slot="check-list"
			className={cn("mt-3 flex flex-col gap-2", className)}
			{...props}
		/>
	);
}

function CheckItem({
	className,
	children,
	...props
}: React.ComponentProps<"li">) {
	return (
		<li
			data-slot="check-item"
			className={cn(
				"grid grid-cols-[16px_minmax(0,1fr)] gap-2 text-body-foreground text-sm",
				className,
			)}
			{...props}
		>
			<Check aria-hidden="true" className="mt-0.75 size-3.5 text-blue" />
			<span className="min-w-0">{children}</span>
		</li>
	);
}

function MailItem({
	highlighted = false,
	mine = false,
	className,
	...props
}: React.ComponentProps<"article"> & {
	highlighted?: boolean;
	mine?: boolean;
}) {
	return (
		<article
			data-slot="mail-item"
			data-highlighted={highlighted || undefined}
			data-mine={mine || undefined}
			className={cn(
				"min-w-0 scroll-mt-18 rounded-md border bg-background p-3 transition-colors duration-300 data-highlighted:border-blue data-highlighted:bg-active data-mine:bg-muted md:px-4 md:py-3.5",
				className,
			)}
			{...props}
		/>
	);
}

function MailItemHeader({
	who,
	when,
	className,
	...props
}: Omit<React.ComponentProps<"div">, "children"> & {
	who: React.ReactNode;
	when: React.ReactNode;
}) {
	return (
		<div
			data-slot="mail-item-header"
			className={cn(
				"flex flex-wrap items-center gap-2.5 text-muted-foreground",
				className,
			)}
			{...props}
		>
			<span className="inline-flex min-w-0 items-center gap-2 text-2sm text-foreground">
				{who}
			</span>
			<MonoLabel className="w-full md:ms-auto md:w-auto">{when}</MonoLabel>
		</div>
	);
}

function MailItemTags({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="mail-item-tags"
			className={cn("mt-2 flex flex-wrap gap-1.5", className)}
			{...props}
		/>
	);
}

function MailItemSubject({ className, ...props }: React.ComponentProps<"h4">) {
	return (
		<h4
			data-slot="mail-item-subject"
			className={cn(
				"mt-2.5 wrap-anywhere font-medium text-md tracking-tight",
				className,
			)}
			{...props}
		/>
	);
}

function MailItemBody({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="mail-item-body"
			className={cn(
				"mt-2 max-w-155 wrap-anywhere whitespace-pre-line text-body-foreground text-sm",
				className,
			)}
			{...props}
		/>
	);
}

function MailItemFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="mail-item-footer"
			className={cn("mt-2.5 flex flex-wrap gap-4", className)}
			{...props}
		/>
	);
}

function TextMark({ className, ...props }: React.ComponentProps<"mark">) {
	return (
		<mark
			data-slot="text-mark"
			className={cn(
				"bg-accent px-0.5 text-foreground shadow-[inset_0_-1px_0_var(--blue)]",
				className,
			)}
			{...props}
		/>
	);
}

function CardEyebrow({ children }: { children: React.ReactNode }) {
	return (
		<div data-slot="card-eyebrow" className="flex items-center gap-2">
			<Square tone="blue" />
			<MonoLabel>{children}</MonoLabel>
		</div>
	);
}

export {
	ActionBar,
	ActionBarSpacer,
	CardEyebrow,
	CheckItem,
	CheckList,
	MailItem,
	MailItemBody,
	MailItemFooter,
	MailItemHeader,
	MailItemSubject,
	MailItemTags,
	type ProgressStep,
	SplitAside,
	SplitFoot,
	SplitLayout,
	SplitMain,
	StoryChapter,
	StoryChapters,
	StoryFact,
	StoryFacts,
	StoryGist,
	StoryName,
	StoryProgress,
	StoryQuote,
	StorySkeleton,
	StoryStatus,
	StoryText,
	StoryTrack,
	StoryTrackKey,
	TextMark,
	type TrackMark,
};
