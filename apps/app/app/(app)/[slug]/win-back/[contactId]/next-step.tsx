"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	DraftCard,
	DraftCardActions,
	DraftCardBody,
	DraftCardDescription,
	DraftCardMail,
	DraftCardMailHeader,
	DraftCardMeta,
	DraftCardPreview,
	DraftCardTitle,
} from "@crm/ui/components/draft-card";
import { MailIcon, OpenIcon } from "@crm/ui/components/line-icons";
import { Spinner } from "@crm/ui/components/spinner";
import {
	ActionBar,
	CardEyebrow,
	CheckItem,
	CheckList,
} from "@crm/ui/components/story";
import { Textarea } from "@crm/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { PLAN_LIMIT_MESSAGES } from "@crm/validation/plan-limit-reason";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
	copyText,
	mailtoFits,
	mailtoHref,
	useEmailDraft,
} from "@/components/crm/use-email-draft";
import { DEMO } from "@/components/demo/demo-tour-config";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import { dateFormat } from "@/lib/i18n/format";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { WIN_BACK_UI } from "../win-back-config";
import {
	answerIsNext,
	type CardStep,
	followUpDaysOf,
	type NextPerson,
	nextLabel,
	type PersonView,
	replyDraftOutdated,
	withListState,
} from "./person-view";

const LONG_DAY = { day: "numeric", month: "long" } as const;

type Variant = "full" | "short";

type Verdict = "good" | "bad" | "later" | null;

type Done =
	| { kind: "later"; reminderId: string }
	| { kind: "skip"; previous: Verdict }
	| { kind: "sent"; previous: Verdict; marked: boolean };

function verdictOf(value: string | null): Verdict {
	return value === "good" || value === "bad" || value === "later"
		? value
		: null;
}

function paragraphs(text: string): string[] {
	return text
		.split(/\n{2,}/)
		.map((part) => part.trim())
		.filter(Boolean);
}

export function useNextStep(
	view: PersonView,
	next: NextPerson,
	place: string | null,
) {
	const t = useT();
	const locale = useLocale();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const search = useSearchParams().toString();
	const contactId = view.contact.id;
	const first = view.contact.firstName;
	const days = WIN_BACK_UI.remindLater.afterDays;

	const [step, setStep] = useState<CardStep>(
		view.feedback === "bad" ? "skip" : "read",
	);
	const [body, setBody] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);
	const [variant, setVariant] = useState<Variant>("full");
	const [asking, setAsking] = useState<Variant | null>(null);
	const [done, setDone] = useState<Done | null>(null);

	const draft = useEmailDraft(contactId, true);
	const email = view.contact.email;
	useMountEffect(() => {
		if (email && view.feedback !== "bad") draft.refresh();
	});
	const shortVersion = draft.draft?.oneOff ?? null;
	const outdated = replyDraftOutdated(view, draft.draft);
	const shown = outdated
		? null
		: variant === "short"
			? shortVersion
			: draft.draft
				? { subject: draft.draft.subject, body: draft.draft.body }
				: null;
	const subject = shown?.subject ?? draft.draft?.subject ?? "";
	const text = body ?? shown?.body ?? "";
	const remindOn = new Date(Date.now() + days * WIN_BACK_UI.person.dayMs);
	const remindText = dateFormat(locale, LONG_DAY).format(remindOn);

	const feedback = useMutation(
		trpc.reactivation.setFeedback.mutationOptions({
			onSuccess: () => void cache.winBack(),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);
	const reminder = useMutation(
		trpc.activities.create.mutationOptions({
			onSuccess: () => void cache.activity(),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);
	const unremind = useMutation(
		trpc.activities.remove.mutationOptions({
			onSuccess: () => void cache.activity(),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const goNext = () => {
		router.push(
			withListState(
				workspaceUrl(next ? `/win-back/${next.id}` : "/win-back"),
				search,
			),
		);
	};

	const revert = (entry: Done | null) => {
		if (entry?.kind === "later") unremind.mutate({ id: entry.reminderId });
		if (entry?.kind === "skip" || (entry?.kind === "sent" && entry.marked)) {
			feedback.mutate({ contactIds: [contactId], verdict: entry.previous });
		}
		if (entry === null && step === "skip") {
			feedback.mutate({ contactIds: [contactId], verdict: null });
		}
		setDone(null);
		setStep("read");
		toast(t("Undone."));
	};

	const undo = () => revert(done);

	const finish = (next: CardStep, entry: Done, message: string) => {
		setDone(entry);
		setEditing(false);
		setStep(next);
		toast(message, {
			action: { label: t("Undo"), onClick: () => revert(entry) },
		});
	};

	const open = () => {
		setStep("open");
		if (outdated) {
			setBody(null);
			setEditing(false);
		}
		void draft.ensure({
			covering: answerIsNext(view) ? view.wroteBack?.answeredAt : undefined,
		});
	};

	const later = () => {
		if (reminder.isPending) return;
		const due = new Date(remindOn);
		due.setHours(0, 0, 0, 0);
		reminder.mutate(
			{
				type: "TASK",
				subject: t("Get back to {name}", { name: first }),
				dueAt: due.toISOString(),
				contactId,
			},
			{
				onSuccess: (entry) =>
					finish(
						"later",
						{ kind: "later", reminderId: entry.id },
						t("Reloop reminds you of {name} on {date}.", {
							name: first,
							date: remindText,
						}),
					),
			},
		);
	};

	const skip = () => {
		feedback.mutate(
			{ contactIds: [contactId], verdict: "bad" },
			{
				onSuccess: () =>
					finish(
						"skip",
						{ kind: "skip", previous: verdictOf(view.feedback) },
						t("{name} stays out of the list.", { name: first }),
					),
			},
		);
	};

	const copy = () => copyText(`${subject}\n\n${text}`, t);

	const send = () => {
		if (!email || !shown) return;
		const href = mailtoHref(email, subject, text);
		if (mailtoFits(href)) {
			window.location.href = href;
		} else {
			void copy().then(
				(copied) =>
					copied &&
					toast.info(
						t(
							"This draft is too long for a mail link. Paste the copied text into your mail app.",
						),
					),
			);
		}
		const marked = view.feedback === null;
		if (marked) {
			feedback.mutate({ contactIds: [contactId], verdict: "good" });
		}
		finish(
			"sent",
			{ kind: "sent", previous: verdictOf(view.feedback), marked },
			t("Your mail program opens with this text."),
		);
	};

	const changeVariant = (next: Variant) => {
		if (next === variant || draft.blocked) return;
		if (body !== null && body !== (shown?.body ?? "")) {
			setAsking(next);
			return;
		}
		applyVariant(next);
	};

	const applyVariant = (next: Variant) => {
		setAsking(null);
		setEditing(false);
		setBody(null);
		setVariant(next);
		if (next === "short" && !shortVersion) {
			draft.write(WIN_BACK_UI.person.shorter, true);
		}
	};

	const toggleEdit = () => {
		if (editing) toast(t("Your change is kept for this message."));
		if (!editing && body === null) setBody(shown?.body ?? "");
		setEditing(!editing);
	};

	return {
		view,
		next,
		place,
		shown,
		outdated,
		step,
		first,
		days,
		remindText,
		draft,
		email,
		subject,
		text,
		editing,
		variant,
		asking,
		setAsking,
		setBody,
		open,
		later,
		skip,
		send,
		copy,
		undo,
		goNext,
		toggleEdit,
		changeVariant,
		applyVariant,
		busy: feedback.isPending || reminder.isPending,
	};
}

type NextStep = ReturnType<typeof useNextStep>;

function NextButton({ step }: { step: NextStep }) {
	const t = useT();

	return (
		<>
			<Button onClick={step.goNext}>
				<OpenIcon data-icon="inline-start" />
				{nextLabel(step.next, t)}
			</Button>
			{step.place ? (
				<span className="text-2sm text-muted-foreground">{step.place}</span>
			) : null}
		</>
	);
}

function DraftState({ step }: { step: NextStep }) {
	const t = useT();
	const { draft } = step;

	if (draft.held && (!draft.draft || step.outdated)) {
		return (
			<p className="text-muted-foreground text-sm">
				{draft.planLimit
					? t(PLAN_LIMIT_MESSAGES.drafts)
					: t(
							"The subscription limit is reached. The agent writes this draft when the limit resets, in",
						)}
			</p>
		);
	}
	if (draft.waiting) {
		return (
			<p className="flex items-center gap-2 text-muted-foreground text-sm">
				<Spinner />
				{step.variant === "short"
					? t("Reloop is writing a shorter version…")
					: t("Reloop is writing the message…")}
			</p>
		);
	}
	if (step.variant === "short" && !step.shown) {
		return (
			<p className="text-muted-foreground text-sm">
				{t("Reloop has not written a shorter version.")}
			</p>
		);
	}
	if (draft.failed) {
		return (
			<p className="text-muted-foreground text-sm">
				{t("The agent could not write this draft. Press Write again to retry.")}
			</p>
		);
	}
	if (step.outdated) {
		return (
			<p className="text-muted-foreground text-sm">
				{t(
					"Reloop has not written the answer yet. Reload the page to try again.",
				)}
			</p>
		);
	}
	return null;
}

function OpenMail({ step }: { step: NextStep }) {
	const t = useT();
	const { draft } = step;

	return (
		<DraftCardMail>
			<DraftCardMailHeader>
				<DraftCardMeta>
					<dt>{t("To")}</dt>
					<dd>{step.email}</dd>
					<dt>{t("Subject")}</dt>
					<dd>{step.subject || " "}</dd>
				</DraftCardMeta>
				<ToggleGroup
					type="single"
					size="sm"
					value={step.variant}
					disabled={!draft.draft || draft.blocked || step.outdated}
					onValueChange={(value) => {
						if (value === "full" || value === "short")
							step.changeVariant(value);
					}}
					aria-label={t("Length")}
				>
					<ToggleGroupItem value="full">{t("As suggested")}</ToggleGroupItem>
					<ToggleGroupItem value="short">{t("Shorter")}</ToggleGroupItem>
				</ToggleGroup>
			</DraftCardMailHeader>
			<DraftState step={step} />
			{step.shown && !draft.waiting ? (
				step.editing ? (
					<Textarea
						variant="draft"
						size="sm"
						value={step.text}
						aria-label={t("Email text")}
						onChange={(event) => step.setBody(event.target.value)}
					/>
				) : (
					<DraftCardBody>
						{paragraphs(step.text).map((part) => (
							<p key={part}>{part}</p>
						))}
					</DraftCardBody>
				)
			) : null}
			{step.editing ? (
				<p className="text-muted-foreground text-xs">
					{t(
						"Write straight into the text. Send opens your mail program with exactly this text.",
					)}
				</p>
			) : null}
		</DraftCardMail>
	);
}

function CardBody({ step }: { step: NextStep }) {
	const t = useT();
	const { first, draft } = step;

	if (step.step === "read") {
		const preview =
			draft.draft && !draft.waiting && !step.outdated
				? paragraphs(draft.draft.body).slice(1, 3).join(" ")
				: "";
		return (
			<>
				<CardEyebrow>{t("Your next step")}</CardEyebrow>
				<DraftCardTitle>
					{!step.email
						? t("{name} has no email address", { name: first })
						: answerIsNext(step.view)
							? t("Reply to them")
							: t("Send {name} a short email", { name: first })}
				</DraftCardTitle>
				<DraftCardDescription>
					{step.email && answerIsNext(step.view)
						? t(
								"They wrote back after your win back mail. Reloop prepares the answer in your tone.",
							)
						: t("Reloop prepares it in your tone, with what the story says.")}
				</DraftCardDescription>
				{draft.waiting && step.email ? (
					<p className="flex items-center gap-2 text-muted-foreground text-sm">
						<Spinner />
						{t("Reloop is writing the message…")}
					</p>
				) : preview ? (
					<DraftCardPreview>
						<p>{preview}</p>
					</DraftCardPreview>
				) : null}
				<DraftCardActions>
					{step.email ? (
						<Button onClick={step.open} data-demo={DEMO.mark.personMessage}>
							<MailIcon data-icon="inline-start" />
							{t("View message")}
						</Button>
					) : null}
					<Button
						variant="link"
						size="text"
						disabled={step.busy}
						onClick={step.later}
					>
						{t("Remind me in {count} days", { count: step.days })}
					</Button>
					<Button
						variant="link"
						size="text"
						disabled={step.busy}
						onClick={step.skip}
					>
						{t("Not for us")}
					</Button>
				</DraftCardActions>
			</>
		);
	}

	if (step.step === "open") {
		return (
			<>
				<CardEyebrow>{t("Ready message")}</CardEyebrow>
				<DraftCardTitle>{t("Read it once, then send")}</DraftCardTitle>
				<OpenMail step={step} />
				<DraftCardActions>
					<Button disabled={!step.shown || draft.waiting} onClick={step.send}>
						<MailIcon data-icon="inline-start" />
						{t("Send")}
					</Button>
					<Button
						variant="outline"
						disabled={!step.shown || draft.waiting}
						onClick={step.toggleEdit}
					>
						{step.editing ? t("Done") : t("Edit text")}
					</Button>
					<Button
						variant="link"
						size="text"
						disabled={!step.shown || draft.waiting}
						onClick={() => void step.copy()}
					>
						{t("Copy")}
					</Button>
					<Button
						variant="link"
						size="text"
						disabled={step.busy}
						onClick={step.later}
					>
						{t("Later")}
					</Button>
				</DraftCardActions>
			</>
		);
	}

	const followUpDays = followUpDaysOf(step.view);
	const done = {
		sent: {
			eyebrow: t("Completed"),
			title: t("The message to {name} is in your mail program", {
				name: first,
			}),
			description: null,
		},
		later: {
			eyebrow: t("Reminder set"),
			title: t("{name} comes back on {date}", {
				name: first,
				date: step.remindText,
			}),
			description: t("A task is due that day. The message stays prepared."),
		},
		skip: {
			eyebrow: t("Not for us"),
			title: t("{name} stays out of the list", { name: first }),
			description: t(
				"Reloop learns from your verdicts and suggests cases like this less often.",
			),
		},
	}[step.step];

	return (
		<>
			<CardEyebrow>{done.eyebrow}</CardEyebrow>
			<DraftCardTitle>{done.title}</DraftCardTitle>
			{done.description ? (
				<DraftCardDescription>{done.description}</DraftCardDescription>
			) : null}
			{step.step === "sent" ? (
				<CheckList className="mt-0">
					<CheckItem>
						{t("Your mail program opened with this text. Send it from there.")}
					</CheckItem>
					{followUpDays !== null ? (
						<CheckItem>
							{t(
								"If {name} does not answer, Reloop reminds you in {count} days.",
								{
									name: first,
									count: followUpDays,
								},
							)}
						</CheckItem>
					) : null}
				</CheckList>
			) : null}
			<DraftCardActions>
				<NextButton step={step} />
				<Button variant="link" size="text" onClick={step.undo}>
					{t("Undo")}
				</Button>
				{step.step === "sent" ? (
					<Button variant="link" size="text" onClick={() => void step.copy()}>
						{t("Copy the text")}
					</Button>
				) : null}
			</DraftCardActions>
		</>
	);
}

export function NextStepCard({ step, id }: { step: NextStep; id: string }) {
	const t = useT();

	return (
		<>
			<DraftCard id={id} aria-label={t("Your next step")} tabIndex={-1}>
				<CardBody step={step} />
			</DraftCard>
			<AlertDialog
				open={step.asking !== null}
				onOpenChange={(open) => !open && step.setAsking(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("Discard your changes?")}</AlertDialogTitle>
						<AlertDialogDescription>
							{step.asking === "full"
								? t(
										"The suggested version comes back. Your changes to the text are lost.",
									)
								: t(
										"Reloop writes a shorter version from the suggestion. Your changes to the text are lost.",
									)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => step.asking && step.applyVariant(step.asking)}
						>
							{step.asking === "full"
								? t("Show the suggestion")
								: t("Write shorter")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export function NextStepBar({
	step,
	cardId,
}: {
	step: NextStep;
	cardId: string;
}) {
	const t = useT();
	const { draft } = step;
	const open = () => {
		step.open();
		document
			.getElementById(cardId)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	if (step.step === "read") {
		return (
			<ActionBar>
				{step.email ? (
					<Button size="lg" onClick={open}>
						{t("View message")}
					</Button>
				) : null}
				<Button
					variant="link"
					size="text"
					disabled={step.busy}
					onClick={step.later}
				>
					{t("Later")}
				</Button>
			</ActionBar>
		);
	}
	if (step.step === "open") {
		return (
			<ActionBar>
				<Button
					size="lg"
					disabled={!step.shown || draft.waiting}
					onClick={step.send}
				>
					<MailIcon data-icon="inline-start" />
					{t("Send")}
				</Button>
				<Button
					variant="link"
					size="text"
					disabled={step.busy}
					onClick={step.later}
				>
					{t("Later")}
				</Button>
			</ActionBar>
		);
	}

	return (
		<ActionBar>
			<Button size="lg" onClick={step.goNext}>
				{nextLabel(step.next, t)}
			</Button>
			<Button variant="link" size="text" onClick={step.undo}>
				{t("Undo")}
			</Button>
		</ActionBar>
	);
}
