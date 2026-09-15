"use client";

import Copy from "@carbon/icons-react/es/Copy";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
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
import { Icon } from "@crm/ui/components/icon";
import { Label } from "@crm/ui/components/label";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function TrackingScript() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const tracking = useQuery(trpc.tracking.settings.queryOptions());
	const [section, setSection] = useState("html");

	const setFlag = useMutation(
		trpc.tracking.setFlag.mutationOptions({
			onSuccess: async (_result, input) => {
				await cache.tracking();
				toast.success(
					input.enabled
						? t(
								"Tracking paused. The script stops recording within five minutes.",
							)
						: t("Tracking resumed."),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const rotate = useMutation(
		trpc.tracking.rotateSiteId.mutationOptions({
			onSuccess: async () => {
				await cache.tracking();
				toast.success(t("Site ID rotated. Paste the new tag on your website."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!tracking.data) return null;

	const {
		siteId,
		snippet,
		tagManagerSnippet,
		scriptUrl,
		receivingSince,
		paused,
		canManage,
	} = tracking.data;

	const copy = (value: string | null) => {
		const clipboard = navigator.clipboard;

		if (!value || !clipboard) {
			toast.error(t("Could not copy the script. Select it instead."));
			return;
		}

		clipboard
			.writeText(value)
			.then(() => toast.success(t("Script copied.")))
			.catch(() => toast.error(t("Could not copy the script.")));
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						{t("Tracking script")}
						<StatusIndicator
							size="sm"
							tone={paused ? "warning" : receivingSince ? "success" : "neutral"}
							label={
								paused
									? t("Paused")
									: receivingSince
										? t("Receiving page views")
										: t("No page views yet")
							}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{t("One tag, 4 KB, in the head of every page you measure.")}
				</CardDescription>

				<CardAction>
					<Button
						size="sm"
						onClick={() =>
							copy(section === "gtm" ? tagManagerSnippet : snippet)
						}
						type="button"
					>
						<Icon icon={Copy} data-icon="inline-start" />
						{t("Copy")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<Accordion
					type="single"
					collapsible
					value={section}
					onValueChange={setSection}
				>
					<AccordionItem value="html">
						<AccordionTrigger>{t("Paste it into your HTML")}</AccordionTrigger>
						<AccordionContent className="flex flex-col gap-4">
							<pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-code-foreground text-xs/5">
								<span className="text-code-accent">{"<script"}</span>
								{"\n  src="}
								<span className="text-code-string">{`"${scriptUrl}"`}</span>
								{"\n  data-site="}
								<span className="text-code-string">{`"${siteId}"`}</span>
								{"\n  async\n  defer\n"}
								<span className="text-code-accent">{"></script>"}</span>
							</pre>
							<p className="text-muted-foreground text-xs/relaxed">
								{t("Site ID")}{" "}
								<span className="font-mono text-foreground">{siteId}</span> ·{" "}
								{t("Rotating it stops every copy of the old script at once.")}
							</p>
						</AccordionContent>
					</AccordionItem>

					<AccordionItem value="gtm">
						<AccordionTrigger>
							{t("Add it through Google Tag Manager")}
						</AccordionTrigger>
						<AccordionContent className="flex flex-col gap-4">
							<pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-code-foreground text-xs/5">
								<span className="text-code-accent">{"<script"}</span>
								{"\n  src="}
								<span className="text-code-string">{`"${scriptUrl}?site=${siteId}"`}</span>
								{"\n  async\n  defer\n"}
								<span className="text-code-accent">{"></script>"}</span>
							</pre>
							<ol className="flex list-decimal flex-col gap-1 pl-4 text-muted-foreground text-xs/relaxed">
								<li>{t("In Tag Manager, add a new Custom HTML tag.")}</li>
								<li>
									{t(
										"Paste this snippet, not the one above, as the tag's HTML.",
									)}
								</li>
								<li>
									{t(
										"Trigger it on All Pages, then publish the container. Keep {url} off any consent-blocked category you do not need.",
										{ url: scriptUrl },
									)}
								</li>
							</ol>
							<p className="text-muted-foreground text-xs/relaxed">
								{t(
									"Tag Manager drops a {attribute} attribute when it injects a script, so this form carries the site ID in the URL instead.",
									{ attribute: "data-site" },
								)}
							</p>
						</AccordionContent>
					</AccordionItem>
				</Accordion>

				<div className="flex items-center justify-between gap-6">
					<Label
						htmlFor="tracking-paused"
						className="flex flex-col items-start gap-1"
					>
						<span className="text-sm">{t("Pause tracking")}</span>
						<span className="font-normal text-muted-foreground text-xs">
							{t(
								"The script keeps loading and records nothing. Your domains and settings are kept",
							)}
						</span>
					</Label>

					<Switch
						id="tracking-paused"
						checked={paused}
						disabled={!canManage || setFlag.isPending}
						onCheckedChange={(enabled) =>
							setFlag.mutate({ flag: "paused", enabled })
						}
					/>
				</div>

				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="ghost"
									size="xs"
									disabled={!canManage || rotate.isPending}
								>
									{t("Rotate site ID")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("Rotate the site ID?")}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{t(
											"Every copy of the old script stops recording at once, including any you have forgotten about. You will need to paste the new tag on every page that carries the old one. Nothing already collected is lost.",
										)}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => rotate.mutate()}
									>
										{t("Rotate")}
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
