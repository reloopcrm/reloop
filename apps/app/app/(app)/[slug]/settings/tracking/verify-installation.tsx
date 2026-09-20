"use client";

import CheckmarkFilled from "@carbon/icons-react/es/CheckmarkFilled";
import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@crm/ui/components/input-group";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Result = RouterOutputs["tracking"]["verify"];

export function VerifyInstallation() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const urlId = useId();

	const [url, setUrl] = useState("");
	const [result, setResult] = useState<Result | null>(null);

	const tracking = useQuery(trpc.tracking.settings.queryOptions());

	const verify = useMutation(
		trpc.tracking.verify.mutationOptions({
			onSuccess: (outcome) => setResult(outcome),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!tracking.data) return null;

	const { canManage, siteId } = tracking.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						{t("Verify installation")}
						{result ? <Indicator result={result} /> : null}
					</div>
				</CardTitle>
				<CardDescription>
					{t(
						"We load one page and look for the script, then read your Tag Manager container if it is not in the HTML.",
					)}
				</CardDescription>

				<CardAction>
					<Button
						size="sm"
						type="submit"
						form="verify-tracking"
						disabled={!canManage || verify.isPending || url.trim() === ""}
					>
						{verify.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t("Check now")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="verify-tracking"
					onSubmit={(event) => {
						event.preventDefault();
						setResult(null);
						verify.mutate({ url: url.trim() });
					}}
				>
					<Field>
						<FieldLabel htmlFor={urlId}>{t("Page to check")}</FieldLabel>
						<InputGroup>
							<InputGroupAddon>
								<InputGroupText>https://</InputGroupText>
							</InputGroupAddon>
							<InputGroupInput
								id={urlId}
								value={url}
								onChange={(event) => {
									setUrl(event.target.value);
									setResult(null);
								}}
								placeholder="acme.com/pricing"
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								inputMode="url"
								disabled={!canManage || verify.isPending}
							/>
						</InputGroup>
						<FieldDescription>
							{t(
								"The page has to be public. A page behind a login always fails this check.",
							)}
						</FieldDescription>
					</Field>
				</form>

				{result && siteId ? <Outcome result={result} siteId={siteId} /> : null}
			</CardContent>
		</Card>
	);
}

function Indicator({ result }: { result: Result }) {
	const t = useT();

	if (result.status === "found" && result.pageView) {
		return (
			<StatusIndicator
				size="sm"
				tone="success"
				label={t("Verified just now")}
			/>
		);
	}

	if (result.status === "found" && result.container?.carriesSiteId === false) {
		return (
			<StatusIndicator
				size="sm"
				tone="warning"
				label={t("Tag Manager needs a fix")}
			/>
		);
	}

	return (
		<StatusIndicator
			size="sm"
			tone="warning"
			label={
				result.status === "found" ? t("No page view yet") : t("Not detected")
			}
		/>
	);
}

function Outcome({ result, siteId }: { result: Result; siteId: string }) {
	const t = useT();

	if (result.status === "unreachable") {
		return (
			<Alert variant="destructive">
				<Icon icon={Warning} />
				<AlertTitle>
					{t("Could not open {host}", { host: result.host })}
				</AlertTitle>
				<AlertDescription>
					{result.detail}{" "}
					{t(
						"Check that the page is public. We never follow a redirect to a private address.",
					)}
				</AlertDescription>
			</Alert>
		);
	}

	if (result.status === "missing") {
		return (
			<Alert variant="destructive">
				<Icon icon={Warning} />
				<AlertTitle>
					{t("No script on {host}", { host: result.host })}
				</AlertTitle>
				<AlertDescription>
					{t(
						"The script was not in the HTML. Check that it sits in the head, above anything that rewrites the page.",
					)}
					{result.containers.length > 0
						? ` ${t(
								"We also read Tag Manager container {containers}, and the script is not in there either.",
								{ containers: result.containers.join(", ") },
							)}`
						: ""}
				</AlertDescription>
			</Alert>
		);
	}

	if (result.container && !result.container.carriesSiteId) {
		return (
			<Alert variant="destructive">
				<Icon icon={Warning} />
				<AlertTitle>{t("Tag Manager will drop the site ID")}</AlertTitle>
				<AlertDescription>
					{t(
						"Container {container} carries the script, but the site ID is missing from its URL, so nothing is recorded. Copy the Tag Manager snippet above and replace the tag's HTML.",
						{ container: result.container.id },
					)}
					{result.pageView
						? ` ${t(
								"A page view did arrive in the last five minutes, so something on this site is still recording.",
							)}`
						: ""}
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Alert>
			<Icon icon={CheckmarkFilled} className="text-success" />
			<AlertTitle>
				{result.container
					? t("Script found in container {container}", {
							container: result.container.id,
						})
					: t("Script found on {host}", { host: result.host })}
			</AlertTitle>
			<AlertDescription>
				{t("It answered in {ms} ms.", { ms: result.responseMs })}{" "}
				{result.allowed
					? t(
							"Site ID {siteId} matched, and this domain is on the allow list.",
							{
								siteId,
							},
						)
					: t(
							"Site ID {siteId} matched, and this domain is not on the allow list.",
							{ siteId },
						)}
				{result.container
					? ` ${t(
							"The script is not in the HTML, so it only runs once Tag Manager fires it. A page view is the proof.",
						)}`
					: ""}
				{result.pageView
					? ` ${t("A page view arrived in the last five minutes.")}`
					: ` ${t("No page view has arrived yet. Open the page in a browser to send one.")}`}
			</AlertDescription>
		</Alert>
	);
}
