"use client";

import Add from "@carbon/icons-react/es/Add";
import Email from "@carbon/icons-react/es/Email";
import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ComponentProps, useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { translateError } from "@/lib/i18n/errors";
import { numberFormat } from "@/lib/i18n/format";
import type { Locale, Translate } from "@/lib/i18n/locale";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type ImapAccount = RouterOutputs["imap"]["status"]["accounts"][number];

const FORM = "add-imap-mailbox";

const CREATE_FROM = [
	{
		value: "relevant",
		label: "Only people who write about your business",
		description:
			"Every conversation is read by the agent first. Only people whose emails are about your products become contacts. Everything else stays out of the CRM.",
	},
	{
		value: "everyone",
		label: "Everyone who writes to you",
		description:
			"Every person who emails you becomes a contact, except automated senders like newsletters and no-reply addresses.",
	},
	{
		value: "replied",
		label: "Only people you replied to",
		description: "A contact is created once you have answered them.",
	},
	{
		value: "nobody",
		label: "Nobody",
		description: "Mail is only filed against contacts already in the CRM.",
	},
] as const;

type CreateFrom = (typeof CREATE_FROM)[number]["value"];

function createFromDescription(value: CreateFrom): string {
	return CREATE_FROM.find((entry) => entry.value === value)?.description ?? "";
}

const PRESETS = [
	{ id: "gmail", label: "Gmail / Google Workspace", host: "imap.gmail.com" },
	{
		id: "outlook",
		label: "Outlook.com / Microsoft 365",
		host: "outlook.office365.com",
	},
	{ id: "icloud", label: "iCloud Mail", host: "imap.mail.me.com" },
	{ id: "yahoo", label: "Yahoo Mail", host: "imap.mail.yahoo.com" },
	{ id: "gmx", label: "GMX", host: "imap.gmx.net" },
	{ id: "webde", label: "WEB.DE", host: "imap.web.de" },
	{ id: "ionos", label: "IONOS", host: "imap.ionos.de" },
	{ id: "strato", label: "STRATO", host: "imap.strato.de" },
	{ id: "custom", label: "Other mail server", host: "" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

const HISTORY = [
	{ value: "all", label: "Everything in the mailbox" },
	{ value: "365", label: "The last 12 months" },
	{ value: "90", label: "The last 90 days" },
	{ value: "0", label: "Only new mail from now on" },
] as const;

type HistoryValue = (typeof HISTORY)[number]["value"];

type PresetNotes = Partial<Record<PresetId, string>>;

const PRESET_NOTES: PresetNotes = {
	gmail:
		"Gmail refuses your normal password over IMAP. Create an app password at myaccount.google.com/apppasswords (two-step verification must be on) and use that here.",
	outlook:
		"Connect Microsoft 365 and Outlook.com using the Microsoft connection instead of an IMAP password.",
	icloud: "iCloud needs an app-specific password from appleid.apple.com.",
	yahoo: "Yahoo needs an app password from the account security page.",
	gmx: "GMX needs IMAP switched on under Settings, POP3/IMAP.",
	webde: "WEB.DE needs IMAP switched on under Settings, POP3/IMAP.",
};

function importSinceFor(history: HistoryValue): string | null {
	if (history === "all") return null;

	const days = Number(history);
	const since = new Date();
	since.setDate(since.getDate() - days);
	since.setHours(0, 0, 0, 0);

	return since.toISOString();
}

function AddMailboxButton(props: ComponentProps<typeof Button>) {
	const t = useT();

	return (
		<Button size="sm" {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			{t("Add mailbox")}
		</Button>
	);
}

function AddMailboxSheet({ onAdded }: { onAdded: () => Promise<void> }) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();

	const presetId = useId();
	const emailId = useId();
	const hostId = useId();
	const portId = useId();
	const usernameId = useId();
	const passwordId = useId();
	const historyId = useId();

	const [open, setOpen] = useState(false);
	const [preset, setPreset] = useState<PresetId>("gmail");
	const [email, setEmail] = useState("");
	const [host, setHost] = useState<string>(PRESETS[0].host);
	const [port, setPort] = useState("993");
	const [secure, setSecure] = useState(true);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [history, setHistory] = useState<HistoryValue>("all");
	const [createFrom, setCreateFrom] = useState<CreateFrom>("relevant");

	function reset() {
		setPreset("gmail");
		setEmail("");
		setHost(PRESETS[0].host);
		setPort("993");
		setSecure(true);
		setUsername("");
		setPassword("");
		setHistory("all");
		setCreateFrom("relevant");
	}

	const add = useMutation(
		trpc.imap.add.mutationOptions({
			onSuccess: async () => {
				await onAdded();
				setOpen(false);
				reset();
				toast.success(
					t("Mailbox connected. The first check starts within a minute."),
				);
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	function choosePreset(next: PresetId) {
		setPreset(next);
		const found = PRESETS.find((entry) => entry.id === next);
		if (found?.host) {
			setHost(found.host);
			setPort("993");
			setSecure(true);
		}
	}

	const ready =
		email.trim() &&
		host.trim() &&
		Number(port) > 0 &&
		username.trim() &&
		password;
	const presetNote = PRESET_NOTES[preset];

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<SheetTrigger asChild>
				<AddMailboxButton />
			</SheetTrigger>

			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>{t("Add a mailbox")}</SheetTitle>
					<SheetDescription>
						{t(
							"Imported email is visible to every member of this workspace. Connect only a mailbox approved for team access.",
						)}
					</SheetDescription>
				</SheetHeader>

				<form
					id={FORM}
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						add.mutate({
							email: email.trim(),
							host: host.trim(),
							port: Number(port),
							secure,
							username: username.trim(),
							password,
							importSince: importSinceFor(history),
							createFrom,
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={presetId}>{t("Provider")}</FieldLabel>
							<Select
								value={preset}
								onValueChange={(value) => choosePreset(value as PresetId)}
							>
								<SelectTrigger id={presetId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PRESETS.map((entry) => (
										<SelectItem key={entry.id} value={entry.id}>
											{t(entry.label)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{presetNote ? (
								<FieldDescription>{t(presetNote)}</FieldDescription>
							) : null}
						</Field>

						<Field>
							<FieldLabel htmlFor={emailId}>{t("Email address")}</FieldLabel>
							<Input
								id={emailId}
								type="email"
								value={email}
								onChange={(event) => {
									setEmail(event.target.value);
									if (!username) setUsername(event.target.value);
								}}
								placeholder="you@example.com"
								autoComplete="off"
								required
							/>
							<FieldDescription>
								{t("Mail sent from this address counts as yours.")}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={hostId}>{t("IMAP server")}</FieldLabel>
							<Input
								id={hostId}
								value={host}
								onChange={(event) => setHost(event.target.value)}
								placeholder="imap.example.com"
								autoComplete="off"
								autoCapitalize="off"
								spellCheck={false}
								required
							/>
						</Field>

						<div className="grid grid-cols-2 gap-4">
							<Field>
								<FieldLabel htmlFor={portId}>{t("Port")}</FieldLabel>
								<Input
									id={portId}
									inputMode="numeric"
									value={port}
									onChange={(event) => setPort(event.target.value)}
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={`${portId}-tls`}>
									{t("Encryption")}
								</FieldLabel>
								<div className="flex h-9 items-center gap-3">
									<Switch
										id={`${portId}-tls`}
										checked={secure}
										onCheckedChange={(next) => {
											setSecure(next);
											setPort(next ? "993" : "143");
										}}
									/>
									<span className="text-muted-foreground text-sm">
										{secure ? t("TLS (port 993)") : t("STARTTLS (port 143)")}
									</span>
								</div>
							</Field>
						</div>

						<Field>
							<FieldLabel htmlFor={usernameId}>{t("Username")}</FieldLabel>
							<Input
								id={usernameId}
								value={username}
								onChange={(event) => setUsername(event.target.value)}
								placeholder={t("Usually the email address")}
								autoComplete="off"
								autoCapitalize="off"
								spellCheck={false}
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={passwordId}>{t("Password")}</FieldLabel>
							<Input
								id={passwordId}
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								autoComplete="new-password"
								required
							/>
							<FieldDescription>
								{t(
									"Stored encrypted. Use an app password where your provider offers one.",
								)}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={historyId}>{t("Import history")}</FieldLabel>
							<Select
								value={history}
								onValueChange={(value) => setHistory(value as HistoryValue)}
							>
								<SelectTrigger id={historyId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{HISTORY.map((entry) => (
										<SelectItem key={entry.value} value={entry.value}>
											{t(entry.label)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								{t(
									"Sent mail is read first, so every person you ever replied to is found before their replies are filed. A large mailbox takes a few hours in the background.",
								)}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={`${historyId}-create`}>
								{t("Create contacts from")}
							</FieldLabel>
							<Select
								value={createFrom}
								onValueChange={(value) => setCreateFrom(value as CreateFrom)}
							>
								<SelectTrigger id={`${historyId}-create`} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CREATE_FROM.map((entry) => (
										<SelectItem key={entry.value} value={entry.value}>
											{t(entry.label)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								{t(createFromDescription(createFrom))}
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button type="submit" form={FORM} disabled={!ready || add.isPending}>
						{add.isPending ? <Spinner /> : null}
						{add.isPending ? t("Checking the sign-in…") : t("Connect mailbox")}
					</Button>
					<SheetClose asChild>
						<Button variant="outline">{t("Cancel")}</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function backlogLabel(
	account: ImapAccount,
	t: Translate,
	locale: Locale,
): string | null {
	if (account.backlog <= 0) return null;
	if (account.backlog === 1) return t("1 older message still to read");

	return t("{count} older messages still to read", {
		count: numberFormat(locale).format(account.backlog),
	});
}

function AccountCard({ account }: { account: ImapAccount }) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const syncNow = useMutation(
		trpc.imap.syncNow.mutationOptions({
			onSuccess: () => cache.imap(),
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const setCreateFrom = useMutation(
		trpc.imap.setCreateFrom.mutationOptions({
			onSuccess: () => cache.imap({ settle: "record" }),
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const purge = useMutation(
		trpc.imap.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.imap();
				toast.success(
					t("Removed {count} synced messages.", { count: result.purged }),
				);
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const remove = useMutation(
		trpc.imap.remove.mutationOptions({
			onSuccess: () => cache.imap(),
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const failing = account.status === "NEEDS_RECONNECT" || account.lastError;
	const busy = isSyncing(account.status) || account.backlog > 0;
	const backlog = backlogLabel(account, t, locale);

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						{account.email}
						<StatusIndicator
							size="sm"
							tone={failing ? "warning" : busy ? "info" : "success"}
							label={
								failing
									? t("Needs attention")
									: busy
										? t("Reading mail")
										: t("Connected")
							}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{account.host}:{account.port}
					{account.secure ? ", TLS" : ", STARTTLS"} ·{" "}
					{account.messages === 1
						? t("1 message filed")
						: t("{count} messages filed", {
								count: numberFormat(locale).format(account.messages),
							})}
				</CardDescription>

				<CardAction>
					<Button
						variant="contrast"
						size="sm"
						disabled={syncNow.isPending || isSyncing(account.status)}
						onClick={() => syncNow.mutate({ id: account.id })}
					>
						{syncNow.isPending ? t("Checking…") : t("Check now")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				{failing ? (
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>
							{account.status === "NEEDS_RECONNECT"
								? t("The mail server refused the sign-in")
								: t("The last check failed")}
						</AlertTitle>
						<AlertDescription>
							{(account.lastError
								? translateError(t, locale, account.lastError)
								: null) ??
								t("Remove the mailbox and add it again with a fresh password.")}
						</AlertDescription>
					</Alert>
				) : (
					<p className="text-muted-foreground text-xs">
						{account.lastSyncedAt ? (
							<>
								{t("Last checked")}{" "}
								<LocalRelativeTime date={account.lastSyncedAt} />
							</>
						) : (
							t("Waiting for the first check")
						)}
						{backlog ? <> · {backlog}</> : null}
					</p>
				)}

				<div className="flex items-center justify-between gap-6">
					<Label
						htmlFor={`create-from-${account.id}`}
						className="flex flex-col items-start gap-1"
					>
						<span className="text-sm">{t("Create contacts from")}</span>
						<span className="font-normal text-muted-foreground text-xs">
							{t(createFromDescription(account.createFrom))}
						</span>
					</Label>

					<Select
						value={account.createFrom}
						disabled={setCreateFrom.isPending}
						onValueChange={(value) =>
							setCreateFrom.mutate({
								id: account.id,
								createFrom: value as CreateFrom,
							})
						}
					>
						<SelectTrigger id={`create-from-${account.id}`} className="w-60">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CREATE_FROM.map((entry) => (
								<SelectItem key={entry.value} value={entry.value}>
									{t(entry.label)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={purge.isPending}>
									{t("Delete synced data")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("Delete synced data?")}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{t(
											"Every email brought in from {email} is removed from the CRM. The next check reads the mailbox again from the start.",
											{ email: account.email },
										)}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => purge.mutate({ id: account.id })}
									>
										{t("Delete")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={remove.isPending}>
									{t("Remove mailbox")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("Remove {email}?", { email: account.email })}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{t(
											"New mail stops arriving and the stored password is deleted. Everything already filed stays in the CRM.",
										)}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => remove.mutate({ id: account.id })}
									>
										{t("Remove")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</CardFooter>
			</CardContent>
		</Card>
	);
}

export function ImapConnection({ slug: _slug }: { slug: string }) {
	const t = useT();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const status = useQuery({
		...trpc.imap.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.accounts.some(
				(account) => isSyncing(account.status) || account.backlog > 0,
			)
				? SYNC_POLL_MS
				: false,
	});

	if (!status.data) return null;

	const { accounts } = status.data;

	return (
		<>
			<header className="flex items-start justify-between gap-4 px-(--spacing-block-inline)">
				<div className="flex flex-col gap-2">
					<h1 className="flex items-center gap-2 font-medium text-2xl tracking-tight">
						<Icon icon={Email} />
						{t("Mailbox (IMAP)")}
					</h1>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{t(
							"Reads any mailbox that speaks IMAP, including everything already in it. Conversations are filed against the matching company and contact, and the agent reads them the same way it reads Gmail.",
						)}
					</p>
				</div>
				<AddMailboxSheet onAdded={() => cache.imap()} />
			</header>

			{accounts.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>
							<div className="flex items-center gap-2">
								{t("No mailbox yet")}
								<StatusIndicator
									size="sm"
									tone="neutral"
									label={t("Not connected")}
								/>
							</div>
						</CardTitle>
						<CardDescription>
							{t(
								"Add a mailbox to start. Brings in email and the people on it. Sends nothing, so nothing here can change your mailbox.",
							)}
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<div className="flex flex-col gap-3">
					{accounts.map((account) => (
						<AccountCard key={account.id} account={account} />
					))}
				</div>
			)}
		</>
	);
}
