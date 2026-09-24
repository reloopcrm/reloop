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

function useCollapsibleWidth() {
	const [width, setWidth] = useState<number | null>(null);

	const ref = (node: HTMLDivElement | null) => {
		if (!node) return;
		const measure = () => setWidth(node.scrollWidth);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		document.fonts?.ready.then(measure);
		return () => observer.disconnect();
	};

	return { ref, width };
}

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
		lastY.current = window.scrollY;
		const onScroll = () => {
			const y = window.scrollY;
			if (y <= ISLAND_SCROLL.compactAfterPx) setCompact(false);
			else if (y > lastY.current + ISLAND_SCROLL.directionThresholdPx)
				setCompact(true);
			else if (y < lastY.current - ISLAND_SCROLL.directionThresholdPx)
				setCompact(false);
			if (Math.abs(y - lastY.current) > ISLAND_SCROLL.directionThresholdPx)
				lastY.current = y;
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	};

	const linksWidth = useCollapsibleWidth();
	const languageWidth = useCollapsibleWidth();

	return (
		<header className="pointer-events-none fixed inset-x-0 top-4 z-40 hidden justify-center px-4 md:flex">
			<nav className="pointer-events-auto">
				<FloatingNav ref={scrollRef} compact={compact}>
					{homeLink}
					<FloatingNavCollapsible
						ref={linksWidth.ref}
						style={
							linksWidth.width === null
								? undefined
								: ({
										"--floating-nav-w": `${linksWidth.width}px`,
									} as React.CSSProperties)
						}
					>
						{links}
					</FloatingNavCollapsible>
					{cta}
					<FloatingNavCollapsible
						variant="tail"
						ref={languageWidth.ref}
						style={
							languageWidth.width === null
								? undefined
								: ({
										"--floating-nav-w": `${languageWidth.width}px`,
									} as React.CSSProperties)
						}
					>
						{language}
					</FloatingNavCollapsible>
				</FloatingNav>
			</nav>
		</header>
	);
}
