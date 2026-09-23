"use client";

import Asleep from "@carbon/icons-react/es/Asleep";
import Light from "@carbon/icons-react/es/Light";
import Logout from "@carbon/icons-react/es/Logout";
import UserAvatar from "@carbon/icons-react/es/UserAvatar";
import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import { signOutAndRedirect } from "@/lib/sign-out";

export type AppUser = { name: string; email: string; image: string | null };

export function UserMenu({
	user,
	align = "end",
	children,
}: {
	user: AppUser;
	align?: "start" | "end";
	children: React.ReactNode;
}) {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";
	const t = useT();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="min-w-56">
				<DropdownMenuLabel className="flex items-center gap-2">
					<UserAvatar />
					<span className="min-w-0 truncate">{user.email}</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={(event) => {
						event.preventDefault();
						setTheme(isDark ? "light" : "dark");
					}}
				>
					{isDark ? <Light /> : <Asleep />}
					{isDark ? t("Light mode") : t("Dark mode")}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => {
						signOutAndRedirect().catch(() =>
							toast.error(t("Could not sign out.")),
						);
					}}
				>
					<Logout />
					{t("Sign out")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function UserAvatarImage({
	user,
	size,
}: {
	user: AppUser;
	size: "sm" | "default";
}) {
	return (
		<Avatar size={size}>
			{user.image && <AvatarImage alt={user.name} src={user.image} />}
			<AvatarFallback>{initials(user.name)}</AvatarFallback>
		</Avatar>
	);
}

export function initials(name: string): string {
	return (
		name
			.split(" ")
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}
