"use client";

import Menu from "@carbon/icons-react/es/Menu";
import { Button } from "@crm/ui/components/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import NextLink from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

export type NavSheetLink = { href: string; label: string };

export function NavSheet({ links }: { links: readonly NavSheetLink[] }) {
	const t = useT();
	const [container, setContainer] = useState<HTMLDivElement | null>(null);

	return (
		<div ref={setContainer} className="min-[901px]:hidden">
			<Sheet>
				<SheetTrigger asChild>
					<Button variant="ghost" size="icon" aria-label={t("Menu")}>
						<Menu />
					</Button>
				</SheetTrigger>
				<SheetContent container={container} side="right" className="p-4">
					<SheetTitle className="sr-only">{t("Menu")}</SheetTitle>
					<nav aria-label={t("Menu")} className="mt-10">
						<ul>
							{links.map((link) => (
								<li key={link.href} className="border-border border-b">
									<SheetClose asChild>
										<NextLink
											href={link.href}
											className="block rounded-xs py-3.5 text-(length:--site-text-title-20) text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{link.label}
										</NextLink>
									</SheetClose>
								</li>
							))}
						</ul>
					</nav>
				</SheetContent>
			</Sheet>
		</div>
	);
}
