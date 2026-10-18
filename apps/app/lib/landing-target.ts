import { PROXY } from "@/lib/proxy-config";
import { getSession, workspaceRow } from "@/lib/session";
import { workspaceUrl } from "@/lib/workspace-url";

export async function landingTarget(): Promise<string | null> {
	const session = await getSession();
	if (!session) return PROXY.path.signIn;

	const row = await workspaceRow();
	return row?.slug ? workspaceUrl(row.slug) : null;
}
