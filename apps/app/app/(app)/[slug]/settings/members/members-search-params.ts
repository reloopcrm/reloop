import { isWorkspaceRole } from "@crm/auth/roles";
import {
	createListSearchParams,
	type ListInput,
} from "@/components/data-table/list-search-params";

export const membersSearchParams = createListSearchParams({
	defaultSort: "joinedAt",
	defaultDir: "asc",
	facetIds: ["role"] as const,
});

export function memberListInputOf(input: ListInput<never, "role">) {
	return { ...input, role: input.role.filter(isWorkspaceRole) };
}
