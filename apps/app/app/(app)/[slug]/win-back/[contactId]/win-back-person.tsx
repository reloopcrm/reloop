"use client";

import { Button } from "@crm/ui/components/button";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import {
	ActionBarSpacer,
	SplitAside,
	SplitFoot,
	SplitLayout,
	SplitMain,
	StoryGist,
	StoryName,
	StoryProgress,
	StorySkeleton,
	StoryStatus,
} from "@crm/ui/components/story";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { PERSON_STORY } from "@crm/validation/person-story";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import {
	RecordChip,
	RecordStatusChip,
} from "@/components/crm/record-sheet/record-parts";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { DEMO } from "@/components/demo/demo-tour-config";
import { LocalComputed } from "@/components/local-date-time";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import { dateFormat, numberFormat } from "@/lib/i18n/format";
import { potentialPresentation } from "@/lib/record-standing";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { WIN_BACK_UI } from "../win-back-config";
import {
	winBackInput,
	winBackScopeParsers,
	winBackTable,
} from "../win-back-search-params";
import { NextStepBar, NextStepCard, useNextStep } from "./next-step";
import { mailElementId, PersonMails } from "./person-mails";
import { PersonStory, PersonTrack } from "./person-story";
import {
	type NextPerson,
	type PersonView,
	personName,
	withListState,
} from "./person-view";

const CARD_ID = "win-back-next-step";
const LONG_DAY = { day: "numeric", month: "long", year: "numeric" } as const;
const TIME = { hour: "2-digit", minute: "2-digit" } as const;

type Tab = "story" | "mails";

function Crumbs({ view }: { view: PersonView }) {
	const t = useT();
	const workspaceUrl = useWorkspaceUrl();
	const params = useSearchParams();
	const company = view.contact.company;
	const companyParams = new URLSearchParams(params);
	if (company) companyParams.set("q", company.name);

	return (
		<nav
			aria-label={t("Path")}
			className="flex flex-wrap items-center gap-2 text-2sm text-muted-foreground"
		>
			<Link
				href={withListState(workspaceUrl("/win-back"), params.toString())}
				className="hover:text-foreground"
			>
				{t("Win back")}
			</Link>
			{company ? (
				<>
					<span aria-hidden="true">›</span>
					<Link
						href={withListState(
							workspaceUrl("/win-back"),
							companyParams.toString(),
						)}
						className="hover:text-foreground"
					>
						{company.name}
					</Link>
				</>
			) : null}
			<span aria-hidden="true">›</span>
			<span className="text-foreground">{personName(view.contact)}</span>
		</nav>
	);
}

function Head({ view }: { view: PersonView }) {
	const t = useT();
	const locale = useLocale();
	const name = personName(view.contact);
	const company = view.contact.company;
	const potential = view.potential
		? potentialPresentation(view.potential)
		: null;
	const deals = view.facts.orders;

	return (
		<header className="flex flex-col gap-3.5">
			<div className="flex min-w-0 items-center gap-3.5">
				<PersonAvatar
					src={view.contact.imageUrl}
					name={name}
					email={view.contact.email}
					size="lg"
				/>
				<div className="min-w-0">
					<StoryName>{name}</StoryName>
					<p className="mt-0.75 text-2sm text-muted-foreground">
						{[view.contact.title, company?.name, company?.city]
							.filter(Boolean)
							.join(" · ")}
					</p>
				</div>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{potential ? (
					<RecordStatusChip tone={potential.tone}>
						{t("{level} potential", { level: t(potential.label) })}
					</RecordStatusChip>
				) : null}
				{view.waitingOnUs ? (
					<RecordStatusChip tone="blue">
						{t("Waiting on your reply")}
					</RecordStatusChip>
				) : null}
				<RecordChip>
					{t("Quiet for {count} days", {
						count: numberFormat(locale).format(view.quietDays),
					})}
				</RecordChip>
				<RecordChip>
					{deals === 0
						? t("No deal yet")
						: deals === 1
							? t("1 deal")
							: t("{count} deals", {
									count: numberFormat(locale).format(deals),
								})}
				</RecordChip>
			</div>
		</header>
	);
}

function isWriting(view: PersonView): boolean {
	return view.storyState.queued && !view.story;
}

function WritingHint({ view }: { view: PersonView }) {
	const t = useT();
	const locale = useLocale();
	const name = view.contact.firstName;
	const seconds = WIN_BACK_UI.person.storySeconds;
	const count = Math.min(view.mailCount, PERSON_STORY.messagesRead);

	return (
		<StoryStatus>
			{count === 0
				? t(
						"Reloop is reading the emails with {name} and writing the story. This takes about {seconds} seconds.",
						{ name, seconds },
					)
				: count === 1
					? t(
							"Reloop is reading 1 email with {name} and writing the story. This takes about {seconds} seconds.",
							{ name, seconds },
						)
					: t(
							"Reloop is reading {count} emails with {name} and writing the story. This takes about {seconds} seconds.",
							{ count: numberFormat(locale).format(count), name, seconds },
						)}
		</StoryStatus>
	);
}

function Gist({ view }: { view: PersonView }) {
	const t = useT();
	const locale = useLocale();
	const first = view.contact.firstName;
	const gist = view.story?.gist ?? view.brief;
	const held = view.storyState.limitUntil;

	return (
		<div className="flex flex-col gap-2.5">
			{gist ? <StoryGist>{gist}</StoryGist> : null}
			{isWriting(view) ? (
				<WritingHint view={view} />
			) : (
				<p className="text-2sm text-muted-foreground">
					{held && !view.story ? (
						<LocalComputed
							text={t(
								"Your plan's reading budget for this month is used up. Reloop writes the story of {name} from {date}.",
								{
									name: first,
									date: dateFormat(locale, LONG_DAY).format(new Date(held)),
								},
							)}
						/>
					) : !view.story ? (
						t("Reloop has not written the story of {name} yet.", {
							name: first,
						})
					) : (
						<LocalComputed
							text={t("From {count} emails with {name}, last on {date}.", {
								count: numberFormat(locale).format(view.mailCount),
								name: first,
								date: dateFormat(locale, LONG_DAY).format(
									new Date(view.lastContactAt),
								),
							})}
						/>
					)}
				</p>
			)}
		</div>
	);
}

export function WinBackPerson({ contactId }: { contactId: string }) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();
	const [tab, setTab] = useState<Tab>("story");
	const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(
		new Set(),
	);

	const table = useTableQuery(winBackTable);
	const [scope] = useQueryStates(winBackScopeParsers);
	const next = useQuery({
		...trpc.reactivation.nextPerson.queryOptions({
			contactId,
			...winBackInput(table.input, scope),
		}),
		staleTime: Number.POSITIVE_INFINITY,
	});

	const query = useQuery({
		...trpc.reactivation.person.queryOptions({ contactId }),
		refetchInterval: (state) =>
			state.state.data?.storyState.queued ? WIN_BACK_UI.person.pollMs : false,
	});

	const reread = useMutation(
		trpc.reactivation.rereadStory.mutationOptions({
			onSuccess: () => void query.refetch(),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const view = query.data;
	if (!view) {
		return (
			<p className="text-muted-foreground text-sm">
				{query.error
					? errorMessage(query.error.message)
					: t("This person could not be loaded")}
			</p>
		);
	}

	return (
		<PersonPage
			key={view.contact.id}
			view={view}
			next={next.data ?? null}
			tab={tab}
			setTab={setTab}
			highlighted={highlighted}
			onShow={(ids) => {
				setTab("mails");
				setHighlighted(new Set(ids));
				requestAnimationFrame(() => {
					const targets = ids
						.map((id) => document.getElementById(mailElementId(id)))
						.filter((node) => node !== null)
						.sort((a, b) => a.offsetTop - b.offsetTop);
					targets[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
				});
				window.setTimeout(
					() => setHighlighted(new Set()),
					WIN_BACK_UI.person.highlightMs,
				);
			}}
			rereading={reread.isPending || view.storyState.queued}
			onReread={() => {
				const name = view.contact.firstName;
				reread.mutate(
					{ contactId },
					{
						onSuccess: (result) =>
							toast(
								result.retryAt
									? t(
											"Reloop read the emails with {name} a moment ago. Ask again after {time}.",
											{
												name,
												time: dateFormat(locale, TIME).format(
													new Date(result.retryAt),
												),
											},
										)
									: result.queued
										? t("Thanks. Reloop reads the emails with {name} again.", {
												name,
											})
										: t(
												"Reloop cannot read the emails with {name} again. Story writing is off, or this is sample data.",
												{ name },
											),
							),
					},
				);
			}}
		/>
	);
}

function PersonPage({
	view,
	next,
	tab,
	setTab,
	highlighted,
	onShow,
	rereading,
	onReread,
}: {
	view: PersonView;
	next: NextPerson;
	tab: Tab;
	setTab: (tab: Tab) => void;
	highlighted: ReadonlySet<string>;
	onShow: (ids: string[]) => void;
	rereading: boolean;
	onReread: () => void;
}) {
	const t = useT();
	const step = useNextStep(view, next);
	const stage = step.step === "read" ? 0 : step.step === "open" ? 1 : 2;

	return (
		<>
			<SplitLayout>
				<SplitMain className="gap-4">
					<Crumbs view={view} />
					<StoryProgress
						steps={[t("Understand"), t("Message"), t("Completed")].map(
							(label, index) => ({
								label,
								state:
									index < stage ? "done" : index === stage ? "current" : "next",
							}),
						)}
					/>
					<Head view={view} />
					<Gist view={view} />
					<Tabs
						value={tab}
						onValueChange={(value) => {
							if (value === "story" || value === "mails") setTab(value);
						}}
						className="mt-2"
					>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<TabsList>
								<TabsTrigger value="story">{t("The story")}</TabsTrigger>
								<TabsTrigger value="mails" data-demo={DEMO.mark.personMails}>
									{t("The emails")}
									<span className="font-mono text-2xs text-muted-foreground">
										{view.mailCount}
									</span>
								</TabsTrigger>
							</TabsList>
							<Button
								variant="link"
								size="text"
								onClick={() => {
									setTab("story");
									const card = document.getElementById(CARD_ID);
									card?.scrollIntoView({
										behavior: "smooth",
										block: "nearest",
									});
									card?.focus({ preventScroll: true });
								}}
							>
								{t("Straight to the message")}
							</Button>
						</div>
						<TabsContent value="story" className="mt-2 flex flex-col gap-1">
							<PersonTrack view={view} />
							{isWriting(view) ? (
								<StorySkeleton />
							) : (
								<PersonStory view={view} onShow={onShow} />
							)}
						</TabsContent>
						<TabsContent value="mails" className="mt-2">
							<PersonMails view={view} highlighted={highlighted} />
						</TabsContent>
					</Tabs>
				</SplitMain>
				<SplitAside aria-label={t("Your next step")}>
					<NextStepCard step={step} id={CARD_ID} />
				</SplitAside>
				<SplitFoot>
					<p className="text-2sm text-muted-foreground">
						{t("Is something wrong in the story?")}{" "}
						<Button
							variant="link"
							size="text"
							disabled={rereading}
							onClick={onReread}
						>
							{t("Tell Reloop")}
						</Button>
					</p>
				</SplitFoot>
			</SplitLayout>
			<ActionBarSpacer />
			<NextStepBar step={step} cardId={CARD_ID} />
		</>
	);
}
