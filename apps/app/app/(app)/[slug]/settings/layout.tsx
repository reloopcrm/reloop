import { workspaceRoleOf } from "@crm/auth";
import { Suspense } from "react";
import { isMarketing } from "@/lib/env";
import { requireSession } from "@/lib/session";
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
	const role = await workspaceRoleOf(session.user.id);

	return <SettingsSidebar cloudOwner={isMarketing() && role === "owner"} />;
}
