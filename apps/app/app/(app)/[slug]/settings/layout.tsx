import { isWorkspaceAdmin } from "@crm/auth/roles";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireSession, workspaceRole } from "@/lib/session";
import { hostedCustomer } from "@/lib/tenant";
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
	await connection();
	const session = await requireSession();
	const [role, hosted] = await Promise.all([
		workspaceRole(session.user.id),
		hostedCustomer(),
	]);

	return <SettingsSidebar hosted={hosted} admin={isWorkspaceAdmin(role)} />;
}
