"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import Close from "@carbon/icons-react/es/Close";
import Copy from "@carbon/icons-react/es/Copy";
import Email from "@carbon/icons-react/es/Email";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { translateError } from "@/lib/i18n/errors";
import { useTRPC } from "@/lib/trpc/client";

import { EMAIL_DRAFT } from "./email-draft-config";

export function EmailDraftDialog({
	contactId,
	email,
	name,
}: {
	contactId: string;
	email: string;
	name: string;
}) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const queries = useQueryClient();
	const [open, setOpen] = useState(false);
	const [subject, setSubject] = useState<string | null>(null);
	const [body, setBody] = useState<string | null>(null);
	const [instruction, setInstruction] = useState("");

	const state = useQuery({
		...trpc.contacts.draft.queryOptions({ id: contactId }),
		enabled: open,
		refetchInterval: (query) =>
			query.state.data?.queued ? EMAIL_DRAFT.pollMs : false,
	});

	const learning = state.data?.queued === true;

	const style = useQuery({
		...trpc.settings.draftStyle.queryOptions(),
		enabled: open,
		refetchInterval: open ? EMAIL_DRAFT.pollMs : false,
	});

	const write = useMutation(
		trpc.contacts.writeDraft.mutationOptions({
			onSuccess: (result) => {
				setSubject(null);
				setBody(null);
				setInstruction("");
				queries.setQueryData(
					trpc.contacts.draft.queryKey({ id: contactId }),
					result,
				);
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const forget = useMutation(
		trpc.settings.forgetDraftStyleRule.mutationOptions({
			onSuccess: (result) => {
				queries.setQueryData(trpc.settings.draftStyle.queryKey(), result);
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const draft = state.data?.draft ?? null;
	const failed = state.data?.failed === true;
	const held = state.data?.waitingUntil ?? null;
	const waiting = learning || write.isPending;
	const blocked = waiting || held !== null;
	const rules = style.data?.rules ?? [];

	const changeOpen = async (next: boolean) => {
		setOpen(next);
		setInstruction("");
		setSubject(null);
		setBody(null);
		if (!next) return;
		try {
			const current = await queries.fetchQuery(
				trpc.contacts.draft.queryOptions({ id: contactId }),
			);
			if (!current.draft && !current.queued && !current.waitingUntil)
				write.mutate({ id: contactId });
		} catch (error) {
			toast.error(
				translateError(t, locale, error instanceof Error ? error.message : ""),
			);
		}
	};

	const currentSubject = subject ?? draft?.subject ?? "";
	const currentBody = body ?? draft?.body ?? "";

	const copy = async () => {
		const clipboard = navigator.clipboard;
		if (!clipboard) {
			toast.error(t("This browser does not allow copying."));
			return;
		}

		try {
			await clipboard.writeText(`${currentSubject}\n\n${currentBody}`);
			toast.success(t("Email copied."));
			return true;
		} catch {
			toast.error(t("This browser does not allow copying."));
			return false;
		}
	};

	const revise = () => {
		const wish = instruction.trim();
		if (!wish) return;

		write.mutate({ id: contactId, instruction: wish });
	};

	const mailto = `mailto:${email}?subject=${encodeURIComponent(currentSubject)}&body=${encodeURIComponent(currentBody)}`;

	const mailtoFits = mailto.length <= EMAIL_DRAFT.mailtoMaxChars;

	return (
		<Dialog open={open} onOpenChange={(next) => void changeOpen(next)}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Icon icon={Email} data-icon="inline-start" />
					<span className="hidden sm:inline">{t("Email")}</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[640px]">
				<DialogHeader>
					<DialogTitle>{t("Email to {name}", { name })}</DialogTitle>
					<DialogDescription>
						{waiting
							? t("The agent is reading your conversation and writing a draft.")
							: draft?.stale
								? t("Newer mail has arrived since this draft. Write it again.")
								: t(
										"Change anything you want, then copy it or open your mail.",
									)}
					</DialogDescription>
				</DialogHeader>

				{held && !draft ? (
					<p className="py-8 text-muted-foreground text-sm">
						{t(
							"The subscription limit is reached. The agent writes this draft when the limit resets, in",
						)}{" "}
						<LocalRelativeTime date={held} />
					</p>
				) : waiting && !draft ? (
					<div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
						<Spinner />
						{t("Writing…")}
					</div>
				) : draft ? (
					<div className="flex flex-col gap-3">
						<Input
							value={currentSubject}
							onChange={(event) => setSubject(event.target.value)}
							aria-label={t("Subject")}
						/>
						<Textarea
							rows={12}
							value={currentBody}
							onChange={(event) => setBody(event.target.value)}
							aria-label={t("Email text")}
						/>
					</div>
				) : failed ? (
					<p className="py-8 text-muted-foreground text-sm">
						{t(
							"The agent could not write this draft. Press Write again to retry.",
						)}
					</p>
				) : (
					<p className="py-8 text-muted-foreground text-sm">
						{t("There is no conversation yet to build an email on.")}
					</p>
				)}

				{draft ? (
					<p className="text-muted-foreground text-xs">
						{draft.role === "buyer"
							? t("Written for a buyer.")
							: draft.role === "seller"
								? t("Written for a seller.")
								: t(
										"The role is unclear, so it asks the seller question.",
									)}{" "}
						{draft.modelId
							? t("Written by {model}.", { model: draft.modelId })
							: null}{" "}
						{draft.language
							? t("Language: {language}", { language: draft.language })
							: null}
					</p>
				) : null}

				{draft ? (
					<div className="flex flex-col gap-2">
						<Textarea
							rows={2}
							value={instruction}
							disabled={blocked}
							placeholder={t(
								"Say what you want different, for example: shorter, and ask about Gitterboxen too.",
							)}
							onChange={(event) => setInstruction(event.target.value)}
							aria-label={t("What should be different?")}
						/>
						<div className="flex items-center justify-between gap-2">
							<p className="text-muted-foreground text-xs">
								{t(
									"The agent rewrites the email and keeps a lasting wish as a rule.",
								)}
							</p>
							<Button
								variant="outline"
								size="sm"
								disabled={blocked || instruction.trim().length === 0}
								onClick={revise}
							>
								{waiting ? (
									<Spinner />
								) : (
									<Icon icon={MagicWand} data-icon="inline-start" />
								)}
								{t("Change with AI")}
							</Button>
						</div>
					</div>
				) : null}

				{rules.length > 0 ? (
					<Collapsible>
						<CollapsibleTrigger asChild>
							<Button variant="ghost" size="sm">
								<Icon icon={ChevronDown} data-icon="inline-start" />
								{t("Learned rules ({count} of {max})", {
									count: String(rules.length),
									max: String(style.data?.max ?? rules.length),
								})}
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<ul className="flex flex-col gap-1 pt-2">
								{rules.map((rule) => (
									<li
										key={rule.id}
										className="flex items-center justify-between gap-2 text-muted-foreground text-sm"
									>
										<span>{rule.text}</span>
										<Button
											variant="ghost"
											size="icon"
											aria-label={t("Forget this rule")}
											disabled={forget.isPending}
											onClick={() => forget.mutate({ ruleId: rule.id })}
										>
											<Icon icon={Close} />
										</Button>
									</li>
								))}
							</ul>
						</CollapsibleContent>
					</Collapsible>
				) : null}

				<p className="text-muted-foreground text-xs">
					{t(
						"Only mail from a mailbox connected here comes back into the CRM. Sent from another mailbox, this reach-out is not counted.",
					)}
				</p>

				<DialogFooter>
					<Button
						variant="outline"
						size="sm"
						disabled={blocked}
						onClick={() => write.mutate({ id: contactId })}
					>
						{waiting ? (
							<Spinner />
						) : (
							<Icon icon={Renew} data-icon="inline-start" />
						)}
						{t("Write again")}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!draft}
						onClick={() => void copy()}
					>
						<Icon icon={Copy} data-icon="inline-start" />
						{t("Copy")}
					</Button>
					<Button asChild size="sm" disabled={!draft}>
						<a
							href={mailtoFits ? mailto : undefined}
							onClick={
								mailtoFits
									? undefined
									: (event) => {
											event.preventDefault();
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
							}
						>
							<Icon icon={Email} data-icon="inline-start" />
							{t("Open in mail")}
						</a>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
