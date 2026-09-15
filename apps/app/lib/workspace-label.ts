import { BRAND } from "@crm/ui/lib/brand";

const UNNAMED = ["crm", BRAND.name.toLowerCase()];

export function workspaceLabel(name: string | undefined): string {
	const trimmed = name?.trim();
	if (!trimmed) return BRAND.name;

	return UNNAMED.includes(trimmed.toLowerCase()) ? BRAND.name : trimmed;
}
