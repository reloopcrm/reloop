"use client";

import { useLayoutEffect } from "react";

const SITE_SHELL_ATTRIBUTE = "data-site-shell";

export function SiteShellMarker() {
	useLayoutEffect(() => {
		document.body.setAttribute(SITE_SHELL_ATTRIBUTE, "");
		return () => document.body.removeAttribute(SITE_SHELL_ATTRIBUTE);
	}, []);

	return null;
}
