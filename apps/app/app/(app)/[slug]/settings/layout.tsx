import { isWorkspaceAdmin } from "@crm/auth/roles";
import { Suspense } from "react";
import { isMarketing } from "@/lib/env";
import { requireSession, workspaceRole } from "@/lib/session";
import { hostedCustomer, operatorTenant } from "@/lib/tenant";
import { SettingsSidebar, SettingsSidebarFallback } from "./settings-sidebar";

export default function SettingsLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
			<Suspense fallback={<SettingsSidebarFallback />}>
				<Sidebar />
			</Suspense>
			{children}
		</div>
	);
}

async function Sidebar() {
	const session = await requireSession();
	const [role, hosted, operator] = await Promise.all([
		workspaceRole(session.user.id),
		hostedCustomer(),
		operatorTenant(),
	]);

	return (
		<SettingsSidebar
			cloudOwner={(isMarketing() || operator) && role === "owner"}
			hosted={hosted}
			admin={isWorkspaceAdmin(role)}
		/>
	);
}
