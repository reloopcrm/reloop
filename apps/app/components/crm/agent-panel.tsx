"use client";

import Document from "@carbon/icons-react/es/Document";
import LogoGithub from "@carbon/icons-react/es/LogoGithub";
import LogoLinkedin from "@carbon/icons-react/es/LogoLinkedin";
import {
	Attachment,
	AttachmentContent,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
	AttachmentTrigger,
} from "@crm/ui/components/attachment";
import { Avatar, AvatarFallback } from "@crm/ui/components/avatar";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	DraftCard,
	DraftCardActions,
	DraftCardBody,
	DraftCardHeader,
	DraftCardMeta,
} from "@crm/ui/components/draft-card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { type CarbonIcon, Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { MailIcon, SendIcon } from "@crm/ui/components/line-icons";
import { Loader } from "@crm/ui/components/loader";
import { type MarkTone, MonoLabel } from "@crm/ui/components/mark";
import { Markdown } from "@crm/ui/components/markdown";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@crm/ui/components/message-scroller";
import { Spinner } from "@crm/ui/components/spinner";
import { Step, Steps } from "@crm/ui/components/steps";
import Wordmark from "@crm/ui/components/wordmark";
import { initialsFromName } from "@crm/ui/lib/format";
import { PLAN_LIMIT_MESSAGES } from "@crm/validation/plan-limit-reason";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEveAgent } from "eve/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AgentClarificationComposer } from "@/components/agent-clarification-composer";
import {
	type Conversation,
	ConversationPicker,
	useConversations,
} from "@/components/crm/agent-conversations";
import { contactName } from "@/components/crm/contact-name";
import { EMAIL_DRAFT } from "@/components/crm/email-draft-config";
import { EmailDraftDialog } from "@/components/crm/email-draft-dialog";
import {
	type AgentRecord,
	recordCopy,
	recordFilter,
	recordHeader,
} from "@/lib/agent-record";
import {
	composerState,
	eventsOf,
	loadThread,
	offlineThread,
	type Thread as ThreadState,
} from "@/lib/agent-session";
import {
	NEW_THREAD,
	pendingQuestion,
	resolveThread,
	type Source,
	splitLabel,
	type Tone,
	type TranscriptItem,
	type TranscriptMessage,
	toTranscript,
} from "@/lib/agent-transcript";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { useRecordSheetView } from "./record-sheet/record-stack";

export function AgentPanel({ record }: { record: AgentRecord }) {
	const conversations = useConversations(recordFilter(record));
	const { thread, setThread } = useRecordSheetView("overview");

	const history = conversations.data ?? [];

	if (conversations.isPending) return <Loading />;

	return (
		<LoadedAgentPanel
			record={record}
			history={history}
			thread={thread}
			setThread={setThread}
		/>
	);
}

function LoadedAgentPanel({
	record,
	history,
	thread,
	setThread,
}: {
	record: AgentRecord;
	history: Conversation[];
	thread: string | null;
	setThread: (thread: string) => void;
}) {
	const [landedOn] = useState(() => history[0]?.id ?? NEW_THREAD);
	const { openId, current } = resolveThread({
		conversations: history,
		fromUrl: thread,
		landedOn,
	});

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<ConversationPicker
				conversations={history}
				current={current}
				onSelect={(conversation) => setThread(conversation.id)}
				onNew={() => setThread(NEW_THREAD)}
				busy={false}
			/>

			<ThreadWithHistory
				key={openId ?? NEW_THREAD}
				record={record}
				conversation={current}
				onNewThread={() => setThread(NEW_THREAD)}
			/>
		</div>
	);
}

const WORKING_POLL_MS = 3000;
const SETTLED_TTL_MS = 60_000;

function ThreadWithHistory({
	record,
	conversation,
	onNewThread,
}: {
	record: AgentRecord;
	conversation: Conversation | null;
	onNewThread: () => void;
}) {
	const trpc = useTRPC();

	const thread = useQuery<ThreadState>({
		queryKey: ["agent-thread", conversation?.sessionId],
		enabled: conversation !== null,
		staleTime: SETTLED_TTL_MS,
		refetchOnWindowFocus: false,
		refetchInterval: (query) =>
			query.state.data?.status === "working" ? WORKING_POLL_MS : false,
		queryFn: ({ signal }) =>
			loadThread(conversation?.sessionId ?? "", recordHeader(record), signal),
	});

	const offline = thread.data?.status === "offline";

	const archive = useQuery({
		...trpc.conversations.events.queryOptions({ id: conversation?.id ?? "" }),
		enabled: conversation !== null && offline,
		staleTime: SETTLED_TTL_MS,
	});

	if (conversation && (thread.isPending || (offline && archive.isPending)))
		return <Loading />;

	return (
		<Thread
			key={thread.data?.status === "working" ? "working" : "settled"}
			record={record}
			conversation={conversation}
			thread={
				offline ? offlineThread((archive.data ?? []) as never) : thread.data
			}
			onNewThread={onNewThread}
		/>
	);
}

function Loading() {
	return (
		<div className="flex flex-1 items-center justify-center">
			<Loader />
		</div>
	);
}

function Thread({
	record,
	conversation,
	thread,
	onNewThread,
}: {
	record: AgentRecord;
	conversation: Conversation | null;
	thread: ThreadState | undefined;
	onNewThread: () => void;
}) {
	const t = useT();
	const copy = recordCopy(record.kind);
	const agent = useEveAgent({
		headers: recordHeader(record),
		...(thread && "session" in thread
			? { initialSession: thread.session, initialEvents: eventsOf(thread) }
			: { initialEvents: eventsOf(thread) }),
	});
	const [draft, setDraft] = useState("");

	const opening = useRef<string | null>(conversation?.title ?? null);

	useSavedConversation({
		record: recordFilter(record),
		conversation,
		opening,
		session: agent.session ?? null,
		messages: agent.data.messages.length,
	});

	const busy = agent.status === "submitted" || agent.status === "streaming";
	const messages = toTranscript(agent.data.messages);
	const question = pendingQuestion(agent.data.messages);

	const { locked, ended } = composerState(thread, busy);

	const ask = (message: string) => {
		if (!message.trim() || locked) return;
		opening.current ||= message.trim();
		setDraft("");
		void agent.send({ message: message.trim() });
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<MessageScrollerProvider autoScroll defaultScrollPosition="end">
				<MessageScroller className="flex-1">
					<MessageScrollerViewport>
						<MessageScrollerContent className="gap-5 px-4 py-4 sm:px-5">
							{messages.length === 0 && !busy ? (
								<Idle kind={record.kind} />
							) : null}

							{messages.map((message) => (
								<MessageScrollerItem key={message.id} messageId={message.id}>
									<Turn message={message} skip={question?.requestId ?? null} />
								</MessageScrollerItem>
							))}

							{record.kind === "contact" ? (
								<ContactDraft contactId={record.id} />
							) : null}
						</MessageScrollerContent>
					</MessageScrollerViewport>

					<MessageScrollerButton />
				</MessageScroller>
			</MessageScrollerProvider>

			{agent.error ? <Failure message={agent.error.message} /> : null}

			{thread?.status === "working" && !busy ? (
				<p className="border-t px-4 py-2 text-pretty text-muted-foreground text-xs sm:px-5">
					{t(
						"Still working on the last question. Your next one can go in when it finishes.",
					)}
				</p>
			) : null}

			{ended ? (
				<div className="flex flex-col items-start gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-2">
					<p className="text-pretty text-muted-foreground text-xs">
						{t("This conversation has ended.")}
					</p>
					<Button variant="outline" size="sm" onClick={onNewThread}>
						{t("Start a new conversation")}
					</Button>
				</div>
			) : null}

			<div className="flex flex-col gap-3 border-t px-4 py-3 sm:px-5">
				{!question && !locked ? (
					<div className="flex flex-wrap gap-2">
						{copy.suggestions.map((suggestion) => (
							<Button
								key={suggestion}
								variant="outline"
								size="sm"
								onClick={() => ask(t(suggestion))}
							>
								{t(suggestion)}
							</Button>
						))}
					</div>
				) : null}
				{question ? (
					<AgentClarificationComposer
						key={question.requestId}
						question={question}
						pending={busy}
						onSubmit={(response) => agent.send({ inputResponses: [response] })}
					/>
				) : (
					<form
						className="flex min-w-0 items-center gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							ask(draft);
						}}
					>
						<Input
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							placeholder={t(copy.placeholder)}
							disabled={locked}
						/>
						<Button type="submit" size="icon" disabled={locked}>
							{busy ? <Spinner /> : <SendIcon />}
							<span className="sr-only">{t("Ask")}</span>
						</Button>
					</form>
				)}
			</div>
		</div>
	);
}

function Idle({ kind }: { kind: AgentRecord["kind"] }) {
	const t = useT();
	const copy = recordCopy(kind);

	return (
		<Empty width="wide">
			<EmptyHeader>
				<EmptyMedia>
					<span className="flex h-8 items-center justify-center rounded-md bg-foreground px-2 text-background">
						<Wordmark className="h-3.5 w-auto" />
					</span>
				</EmptyMedia>
				<EmptyTitle>{t(copy.title)}</EmptyTitle>
				<EmptyDescription>{t(copy.blurb)}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function Failure({ message }: { message: string }) {
	const t = useT();
	const known = Object.values(PLAN_LIMIT_MESSAGES).includes(
		message as (typeof PLAN_LIMIT_MESSAGES)[keyof typeof PLAN_LIMIT_MESSAGES],
	);
	const hint = message.includes("not reachable")
		? t("Start it with `bun run dev`, or check AGENT_URL.")
		: message.includes("not configured")
			? t("Set AGENT_BRIDGE_SECRET for both the app and the agent.")
			: null;

	return (
		<div className="border-t px-4 py-3 text-xs sm:px-5">
			<p className="wrap-break-word text-destructive">
				{known ? t(message) : message}
			</p>
			{hint ? (
				<p className="wrap-break-word text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}

const TONE_MARK = {
	neutral: "ink",
	success: "blue",
	warning: "orange",
} satisfies Record<Tone, MarkTone>;

type TurnGroup =
	| {
			kind: "steps";
			id: string;
			items: Extract<TranscriptItem, { kind: "did" }>[];
	  }
	| { kind: "item"; id: string; item: TranscriptItem };

function groupTurn(items: TranscriptItem[]): TurnGroup[] {
	const groups: TurnGroup[] = [];
	for (const item of items) {
		const last = groups.at(-1);
		if (item.kind === "did") {
			if (last?.kind === "steps") last.items.push(item);
			else groups.push({ kind: "steps", id: item.id, items: [item] });
		} else {
			groups.push({ kind: "item", id: item.id, item });
		}
	}
	return groups;
}

function Turn({
	message,
	skip,
}: {
	message: TranscriptMessage;
	skip: string | null;
}) {
	const items = message.items.filter(
		(item) =>
			item.kind !== "reasoned" &&
			!(item.kind === "asked" && item.question.requestId === skip),
	);
	if (items.length === 0) return null;

	return (
		<div className="flex min-w-0 items-start gap-2.5">
			{message.mine ? <MyAvatar /> : <AgentAvatar />}
			<div className="flex min-w-0 flex-1 flex-col gap-4">
				{groupTurn(items).map((group) =>
					group.kind === "steps" ? (
						<Steps key={group.id}>
							{group.items.map((item) => (
								<StepItem key={item.id} item={item} />
							))}
						</Steps>
					) : (
						<Item key={group.id} item={group.item} />
					),
				)}
			</div>
		</div>
	);
}

function StepItem({
	item,
}: {
	item: Extract<TranscriptItem, { kind: "did" }>;
}) {
	const t = useT();
	const split = splitLabel(item);
	const label =
		split === null
			? item.label
			: split.reason === null
				? t(split.verb)
				: t("{verb}: {reason}", {
						verb: t(split.verb),
						reason: split.reason,
					});

	return (
		<Step
			tone={TONE_MARK[item.tone]}
			marker={item.pending ? <Spinner /> : undefined}
			detail={
				item.sources.length > 0 ? <Sources sources={item.sources} /> : null
			}
		>
			{label}
		</Step>
	);
}

function Item({ item }: { item: TranscriptItem }) {
	const t = useT();
	if (item.kind === "said") {
		return item.mine ? (
			<p className="wrap-break-word pt-0.5 text-sm">{item.text}</p>
		) : (
			<Markdown className="wrap-break-word text-sm">{item.text}</Markdown>
		);
	}

	if (item.kind === "asked") {
		return (
			<div className="w-full max-w-sm rounded-md border bg-muted px-3 py-2.5">
				<p className="text-xs">{t("Follow-up")}</p>
				<Markdown className="mt-1.5 wrap-break-word text-sm leading-5">
					{item.question.prompt}
				</Markdown>
			</div>
		);
	}

	return null;
}

function ContactDraft({ contactId }: { contactId: string }) {
	const t = useT();
	const trpc = useTRPC();
	const contact = useQuery(trpc.contacts.byId.queryOptions({ id: contactId }));
	const state = useQuery(trpc.contacts.draft.queryOptions({ id: contactId }));

	const email = contact.data?.email ?? null;
	const draft = state.data?.draft ?? null;
	if (!email || !contact.data) return null;

	const name = contactName(contact.data);

	if (!draft) {
		return (
			<div className="flex min-w-0 flex-wrap items-center gap-3">
				<p className="text-2sm text-muted-foreground">
					{t("No draft for {name} yet.", { name })}
				</p>
				<EmailDraftDialog
					contactId={contactId}
					email={email}
					name={name}
					label={t("Write a draft")}
				/>
			</div>
		);
	}

	const mailto = `mailto:${email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;

	return (
		<DraftCard>
			<DraftCardHeader>
				<MonoLabel className="min-w-0 truncate">
					{t("Draft · Email to {name}", { name })}
				</MonoLabel>
				<Badge variant="outline">{t("Not sent")}</Badge>
			</DraftCardHeader>
			<DraftCardMeta>
				<dt>{t("To")}</dt>
				<dd>{email}</dd>
				<dt>{t("Subject")}</dt>
				<dd>{draft.subject}</dd>
			</DraftCardMeta>
			<DraftCardBody>
				{draft.body
					.split(/\n{2,}/)
					.filter((part) => part.trim())
					.map((part) => (
						<p key={part}>{part}</p>
					))}
			</DraftCardBody>
			<DraftCardActions>
				{mailto.length <= EMAIL_DRAFT.mailtoMaxChars ? (
					<Button asChild>
						<a href={mailto}>
							<MailIcon data-icon="inline-start" />
							{t("Open in mail")}
						</a>
					</Button>
				) : null}
				<EmailDraftDialog
					contactId={contactId}
					email={email}
					name={name}
					label={t("Edit draft")}
				/>
			</DraftCardActions>
		</DraftCard>
	);
}

const SOURCE_ICONS = {
	linkedin: LogoLinkedin,
	github: LogoGithub,
	web: Document,
} satisfies Record<Source["network"], CarbonIcon>;

function Sources({ sources }: { sources: Source[] }) {
	const t = useT();
	return (
		<AttachmentGroup>
			{sources.map((source) => (
				<Attachment key={source.url} size="xs" state="done">
					<AttachmentMedia variant="icon">
						<Icon icon={SOURCE_ICONS[source.network]} />
					</AttachmentMedia>
					<AttachmentContent>
						<AttachmentTitle>{source.title}</AttachmentTitle>
					</AttachmentContent>

					<AttachmentTrigger asChild>
						<a href={source.url} target="_blank" rel="noreferrer noopener">
							<span className="sr-only">
								{t("Open {title}", { title: source.title })}
							</span>
						</a>
					</AttachmentTrigger>
				</Attachment>
			))}
		</AttachmentGroup>
	);
}

function AgentAvatar() {
	return <EntityLogo name="R" size="sm" className="mt-0.5" />;
}

function MyAvatar() {
	const trpc = useTRPC();
	const me = useQuery(trpc.users.me.queryOptions());

	return (
		<Avatar size="xs" className="mt-0.5">
			<AvatarFallback>{initialsFromName(me.data?.name)}</AvatarFallback>
		</Avatar>
	);
}

function useSavedConversation({
	record,
	conversation,
	opening,
	session,
	messages,
}: {
	record: { contactId?: string; companyId?: string; dealId?: string };
	conversation: Conversation | null;
	opening: React.RefObject<string | null>;
	session: {
		sessionId?: string;
		continuationToken?: string;
		streamIndex: number;
	} | null;
	messages: number;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const save = useMutation(trpc.conversations.save.mutationOptions({}));

	const sessionId = session?.sessionId ?? null;
	const token = session?.continuationToken ?? null;
	const streamIndex = session?.streamIndex ?? 0;
	const { contactId, companyId, dealId } = record;

	const isNew = conversation === null || conversation.sessionId !== sessionId;

	const written = useRef<string | null>(null);
	const persist = useEffectEvent(() => {
		save.mutate(
			{
				contactId: contactId || undefined,
				companyId: companyId || undefined,
				dealId: dealId || undefined,
				sessionId: sessionId ?? "",
				continuationToken: token,
				streamIndex,
				messageCount: messages,
				title: isNew ? (opening.current ?? undefined) : undefined,
			},
			{
				onSuccess: () => {
					if (!isNew) return;
					void queryClient.invalidateQueries({
						queryKey: trpc.conversations.list.pathKey(),
					});
				},
			},
		);
	});

	useEffect(() => {
		if (!sessionId) return;

		const cursor = `${sessionId}:${token ?? ""}:${messages}`;
		if (written.current === cursor) return;
		written.current = cursor;
		persist();
	}, [sessionId, token, messages]);
}
