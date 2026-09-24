"use client";

import {
	FloatingNav,
	FloatingNavCollapsible,
} from "@crm/ui/components/floating-nav";
import type * as React from "react";
import { useRef, useState } from "react";

const ISLAND_SCROLL = {
	compactAfterPx: 80,
	directionThresholdPx: 8,
} as const;

export function DynamicIslandNav({
	homeLink,
	links,
	cta,
	language,
}: {
	homeLink: React.ReactNode;
	links: React.ReactNode;
	cta: React.ReactNode;
	language: React.ReactNode;
}) {
	const [compact, setCompact] = useState(false);
	const lastY = useRef(0);

	const scrollRef = (node: HTMLDivElement | null) => {
		if (!node) return;
		const y = window.scrollY;
		lastY.current = y;
		setCompact(y > ISLAND_SCROLL.compactAfterPx);
		const onScroll = () => {
			const scrollY = window.scrollY;
			if (scrollY <= ISLAND_SCROLL.compactAfterPx) setCompact(false);
			else if (scrollY > lastY.current + ISLAND_SCROLL.directionThresholdPx)
				setCompact(true);
			else if (scrollY < lastY.current - ISLAND_SCROLL.directionThresholdPx)
				setCompact(false);
			if (
				Math.abs(scrollY - lastY.current) > ISLAND_SCROLL.directionThresholdPx
			)
				lastY.current = scrollY;
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	};

	return (
		<header className="pointer-events-none fixed inset-x-0 top-4 z-40 hidden justify-center px-4 md:flex">
			<nav className="pointer-events-auto">
				<FloatingNav ref={scrollRef} compact={compact}>
					{homeLink}
					<FloatingNavCollapsible>{links}</FloatingNavCollapsible>
					<div className="ml-4 flex shrink-0 items-center">{cta}</div>
					<FloatingNavCollapsible variant="tail">
						{language}
					</FloatingNavCollapsible>
				</FloatingNav>
			</nav>
		</header>
	);
}
