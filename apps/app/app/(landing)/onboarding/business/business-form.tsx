"use client";

import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { BUSINESS_STEP } from "./business-config";

type Draft = {
	description: string;
	products: string;
	sideProducts: string;
	minimum: string;
	unit: string;
};

function lines(value: string): string[] {
	return value
		.split(/[\n,]/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function BusinessForm() {
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const router = useRouter();
	const id = useId();
	const [openedAt] = useState(Date.now);
	const [edited, setEdited] = useState<Partial<Draft>>({});

	const rules = useQuery(
		trpc.reactivation.rules.queryOptions(undefined, {
			refetchInterval: (query) =>
				query.state.data?.business.description === "" &&
				Date.now() - openedAt < BUSINESS_STEP.waitMs + BUSINESS_STEP.pollMs
					? BUSINESS_STEP.pollMs
					: false,
		}),
	);

	const business = rules.data?.business;
	const proposed: Draft = {
		description: business?.description ?? "",
		products: business?.products.join("\n") ?? "",
		sideProducts: business?.sideProducts.join("\n") ?? "",
		minimum: business?.minPallets ? String(business.minPallets) : "",
		unit: business?.unit ?? "units",
	};
	const draft: Draft = { ...proposed, ...edited };
	const reading =
		rules.isPending ||
		(business?.description === "" &&
			Date.now() - openedAt < BUSINESS_STEP.waitMs);

	const edit = (key: keyof Draft) => (value: string) =>
		setEdited((current) => ({ ...current, [key]: value }));

	const save = useMutation(
		trpc.reactivation.setRules.mutationOptions({
			onSuccess: () => {
				router.refresh();
				router.replace(BUSINESS_STEP.next);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				if (!rules.data) return;

				save.mutate({
					keepMode: true,
					rules: {
						...rules.data,
						business: {
							...rules.data.business,
							description: draft.description.trim(),
							products: lines(draft.products),
							sideProducts: lines(draft.sideProducts),
							minPallets: Math.max(0, Math.trunc(Number(draft.minimum) || 0)),
							unit: draft.unit.trim() || "units",
						},
					},
				});
			}}
			className="flex flex-col gap-6"
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={`${id}-description`}>What you do</FieldLabel>
					<Textarea
						id={`${id}-description`}
						rows={3}
						value={draft.description}
						onChange={(event) => edit("description")(event.target.value)}
						placeholder="We build web apps for mid sized companies."
					/>
					<FieldDescription>
						{reading ? (
							<span className="inline-flex items-center gap-2">
								<Spinner />
								Reading your website for a first draft.
							</span>
						) : (
							"One or two sentences."
						)}
					</FieldDescription>
				</Field>

				<Field>
					<FieldLabel htmlFor={`${id}-products`}>Main products</FieldLabel>
					<Textarea
						id={`${id}-products`}
						rows={3}
						value={draft.products}
						onChange={(event) => edit("products")(event.target.value)}
						placeholder={"Web apps\nMobile apps"}
					/>
					<FieldDescription>One per line.</FieldDescription>
				</Field>

				<Field>
					<FieldLabel htmlFor={`${id}-side-products`}>Side products</FieldLabel>
					<Textarea
						id={`${id}-side-products`}
						rows={2}
						value={draft.sideProducts}
						onChange={(event) => edit("sideProducts")(event.target.value)}
						placeholder="Hosting"
					/>
					<FieldDescription>
						What you also sell, but rank lower. One per line.
					</FieldDescription>
				</Field>

				<div className="grid grid-cols-2 gap-4">
					<Field>
						<FieldLabel htmlFor={`${id}-minimum`}>Big order from</FieldLabel>
						<Input
							id={`${id}-minimum`}
							inputMode="numeric"
							value={draft.minimum}
							onChange={(event) => edit("minimum")(event.target.value)}
							placeholder="10"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor={`${id}-unit`}>Counted in</FieldLabel>
						<Input
							id={`${id}-unit`}
							value={draft.unit}
							onChange={(event) => edit("unit")(event.target.value)}
							placeholder="units"
						/>
					</Field>
				</div>
			</FieldGroup>

			<div className="flex flex-col gap-3">
				<Button type="submit" disabled={!rules.data || save.isPending}>
					{save.isPending ? <Spinner data-icon="inline-start" /> : null}
					Continue
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={save.isPending}
					onClick={() => router.replace(BUSINESS_STEP.next)}
				>
					Skip for now
				</Button>
			</div>
		</form>
	);
}
