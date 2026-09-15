import { workspaceRoleOf } from "@crm/auth";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { dateFormat } from "@/lib/i18n/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Waitlist") };
}

export default async function WaitlistSettingsPage() {
	const t = await getT();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Waitlist")}</PageShellTitle>
					<PageShellDescription>
						{t(
							"Everyone who asked to hear when Reloop CRM Cloud opens. Only owners see this list.",
						)}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Signups />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

type Row = { email: string; createdAt: string; confirmedAt: string | null };

function csvField(value: string): string {
	const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
	return `"${safe.replaceAll('"', '""')}"`;
}

function toCsv(rows: Row[]): string {
	return [
		"email,created_at,confirmed_at",
		...rows.map((row) =>
			[row.email, row.createdAt, row.confirmedAt ?? ""].map(csvField).join(","),
		),
	].join("\n");
}

async function Signups() {
	const session = await requireSession();
	if ((await workspaceRoleOf(session.user.id)) !== "owner") notFound();

	const [t, locale, { rows }] = await Promise.all([
		getT(),
		getLocale(),
		getServerQueryClient().fetchQuery(
			getServerTrpc().waitlist.list.queryOptions(),
		),
	]);

	if (rows.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>{t("No one has joined yet")}</EmptyTitle>
					<EmptyDescription>
						{t(
							"Entries appear here after someone joins on the Get started page.",
						)}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const date = dateFormat(locale, { dateStyle: "medium" });

	return (
		<div className="flex flex-col gap-4">
			<Button variant="outline" asChild className="self-start">
				<a
					href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(rows))}`}
					download="waitlist.csv"
				>
					{t("Export CSV")}
				</a>
			</Button>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("Email")}</TableHead>
						<TableHead>{t("Joined")}</TableHead>
						<TableHead>{t("Status")}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.email}>
							<TableCell>{row.email}</TableCell>
							<TableCell>{date.format(new Date(row.createdAt))}</TableCell>
							<TableCell>
								{row.confirmedAt ? t("Confirmed") : t("Pending")}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
