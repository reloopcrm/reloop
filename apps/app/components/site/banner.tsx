"use client";

import Close from "@carbon/icons-react/es/Close";
import NextLink from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

export type BannerLink = { href: string; label: string };

export function Banner({ link }: { link: BannerLink }) {
	const t = useT();
	const [open, setOpen] = useState(true);

	if (!open) return null;

	return (
		<div
			data-slot="site-banner"
			className="relative flex h-(--site-banner-height) items-center gap-2 bg-(--banner) ps-4 pe-12 text-(--banner-foreground) text-(length:--site-text-small) tracking-[0.02em] min-[901px]:justify-center"
		>
			<span className="hidden min-[901px]:inline">
				{t(
					"Reloop is open source under the GNU AGPL v3. Self-host it or use the cloud.",
				)}
			</span>
			<span className="min-[901px]:hidden">{t("Open source, AGPL v3.")}</span>
			<NextLink
				href={link.href}
				className="rounded-xs underline underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{link.label}
			</NextLink>
			<button
				type="button"
				aria-label={t("Close the banner")}
				onClick={() => setOpen(false)}
				className="absolute inset-y-0 end-4 grid w-6 place-items-center rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<Close aria-hidden="true" className="size-3" />
			</button>
		</div>
	);
}
