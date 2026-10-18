"use client";

import { signOut } from "@crm/auth/client";
import { toast } from "sonner";

export async function signOutAndRedirect(returnTo = "/sign-in") {
	const { error } = await signOut();

	if (error) {
		toast.error(error.message ?? "Could not sign out.");
		return;
	}

	window.location.assign(returnTo);
}
