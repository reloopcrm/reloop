"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { useT } from "@/lib/i18n/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CopyValue } from "../copy-value";

type AddedPerson = RouterOutputs["workspace"]["addPerson"];

export function AddedPersonDialog({
	person,
	onOpenChange,
}: {
	person: AddedPerson | null;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useT();

	return (
		<Dialog open={person !== null} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{t("{name} can sign in now", { name: person?.member.name ?? "" })}
					</DialogTitle>
					<DialogDescription>
						{t("Give {email} this password. Nobody can show it again.", {
							email: person?.member.email ?? "",
						})}
					</DialogDescription>
				</DialogHeader>

				<InputGroup>
					<InputGroupInput value={person?.password ?? ""} readOnly />
					<InputGroupAddon align="inline-end">
						<CopyValue value={person?.password ?? ""} label="Password" />
					</InputGroupAddon>
				</InputGroup>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)}>{t("Done")}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
