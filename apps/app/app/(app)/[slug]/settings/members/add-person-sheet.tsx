"use client";

import Add from "@carbon/icons-react/es/Add";
import { Alert, AlertDescription } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { AddedPersonDialog } from "./added-person-dialog";
import { assignableRoles, ROLE_LABEL, type Role } from "./members-table";

const FORM = "add-person";

type AddedPerson = RouterOutputs["workspace"]["addPerson"];

export function AddPersonSheet() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const emailId = useId();
	const nameId = useId();
	const roleId = useId();

	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [role, setRole] = useState<Role>("member");
	const [added, setAdded] = useState<AddedPerson | null>(null);

	const workspace = useQuery(trpc.workspace.get.queryOptions());

	const add = useMutation(
		trpc.workspace.addPerson.mutationOptions({
			onSuccess: async (person) => {
				await cache.workspace();
				setOpen(false);
				setEmail("");
				setName("");
				setRole("member");
				setAdded(person);
			},
		}),
	);

	if (!workspace.data?.canAddPerson) return null;

	const roles = assignableRoles(workspace.data.viewerRole, "member");

	return (
		<>
			<Sheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) add.reset();
				}}
			>
				<SheetTrigger asChild>
					<Button>
						<Icon icon={Add} data-icon="inline-start" />
						{t("Add person")}
					</Button>
				</SheetTrigger>

				<SheetContent side="right">
					<SheetHeader>
						<SheetTitle>{t("Add person")}</SheetTitle>
						<SheetDescription>
							{t(
								"They get an account and a one-time password. The password is shown once, so pass it on yourself.",
							)}
						</SheetDescription>
					</SheetHeader>

					<form
						id={FORM}
						className="flex-1 overflow-y-auto px-4"
						onSubmit={(event) => {
							event.preventDefault();
							add.mutate({ email: email.trim(), name: name.trim(), role });
						}}
					>
						<FieldGroup>
							{add.error ? (
								<Alert variant="destructive">
									<AlertDescription>
										{errorMessage(add.error.message)}
									</AlertDescription>
								</Alert>
							) : null}

							<Field>
								<FieldLabel htmlFor={emailId}>{t("Email")}</FieldLabel>
								<Input
									id={emailId}
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="alex.weber@acme.com"
									maxLength={255}
									autoComplete="off"
									autoCapitalize="off"
									autoCorrect="off"
									spellCheck={false}
									required
								/>
								<FieldDescription>
									{t(
										"The address they sign in with. It has to be on the ALLOWED_SIGN_IN list.",
									)}
								</FieldDescription>
							</Field>

							<Field>
								<FieldLabel htmlFor={nameId}>{t("Name")}</FieldLabel>
								<Input
									id={nameId}
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Alex Weber"
									maxLength={120}
									autoComplete="off"
									required
								/>
								<FieldDescription>
									{t("The name your team sees on every record they touch.")}
								</FieldDescription>
							</Field>

							<Field>
								<FieldLabel htmlFor={roleId}>{t("Role")}</FieldLabel>
								<Select
									value={role}
									onValueChange={(value) => setRole(value as Role)}
								>
									<SelectTrigger id={roleId} width="full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{roles.map((option) => (
											<SelectItem key={option} value={option}>
												{t(ROLE_LABEL[option])}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FieldDescription>
									{t(
										"Everyone reads and writes every record. The role decides who changes settings.",
									)}
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>

					<SheetFooter>
						<Button
							type="submit"
							form={FORM}
							disabled={!email.trim() || !name.trim() || add.isPending}
						>
							{add.isPending ? <Spinner /> : null}
							{t("Add person")}
						</Button>
						<SheetClose asChild>
							<Button variant="outline">{t("Cancel")}</Button>
						</SheetClose>
					</SheetFooter>
				</SheetContent>
			</Sheet>

			<AddedPersonDialog
				person={added}
				onOpenChange={(next) => {
					if (!next) setAdded(null);
				}}
			/>
		</>
	);
}
