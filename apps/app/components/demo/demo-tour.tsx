"use client";

import { Button } from "@crm/ui/components/button";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { cn } from "@crm/ui/lib/utils";
import { useRef, useState } from "react";
import {
	useRecordSheetView,
	useRecordStack,
} from "@/components/crm/record-sheet/record-stack";
import { useT } from "@/lib/i18n/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { DEMO, type DemoStep } from "./demo-tour-config";

type Phase = "idle" | "counting" | "running" | "fading";

type Point = { x: number; y: number };

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, ms);
		signal.addEventListener("abort", abort, { once: true });
	});
}

function center(element: Element): Point {
	const rect = element.getBoundingClientRect();
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function findVisible(selector: string): HTMLElement | null {
	for (const element of document.querySelectorAll<HTMLElement>(selector)) {
		const rect = element.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) return element;
	}
	return null;
}

async function waitForTarget(
	selector: string,
	signal: AbortSignal,
): Promise<HTMLElement | null> {
	const deadline = Date.now() + DEMO.target.timeoutMs;
	while (Date.now() < deadline) {
		const found = findVisible(selector);
		if (found) return found;
		await sleep(DEMO.target.pollMs, signal);
	}
	return null;
}

export function DemoTour() {
	const t = useT();
	const workspaceUrl = useWorkspaceUrl();
	const { open, closeAll } = useRecordStack();
	const { setTab } = useRecordSheetView("overview");

	const [phase, setPhase] = useState<Phase>("idle");
	const [remaining, setRemaining] = useState(DEMO.countdown.seconds);
	const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
	const [pulse, setPulse] = useState(false);

	const controller = useRef<AbortController | null>(null);
	const actions = useRef({ open, closeAll, setTab, workspaceUrl });
	actions.current = { open, closeAll, setTab, workspaceUrl };

	useMountEffect(() => () => controller.current?.abort());

	const act = (step: DemoStep, element: HTMLElement) => {
		const current = actions.current;
		switch (step.action) {
			case "navigate":
			case "click":
				element.click();
				return;
			case "openFirstRow": {
				const id = element.closest<HTMLElement>(
					`[data-demo="${DEMO.mark.winBackTable}"]`,
				)?.dataset.demoRecord;
				if (id) current.open({ kind: "contact", id });
				return;
			}
			case "tab":
				current.setTab(step.value);
				return;
			case "closeSheet":
				current.closeAll();
				return;
		}
	};

	const selectorOf = (step: DemoStep) =>
		step.action === "navigate"
			? DEMO.navLink(actions.current.workspaceUrl(step.path))
			: step.target;

	const run = async (signal: AbortSignal) => {
		for (let left = DEMO.countdown.seconds; left > 0; left -= 1) {
			setRemaining(left);
			await sleep(DEMO.countdown.tickMs, signal);
		}
		setPhase("running");
		for (const step of DEMO.steps) {
			const element = await waitForTarget(selectorOf(step), signal);
			if (!element) continue;
			setPulse(false);
			element.scrollIntoView({ block: "nearest" });
			setCursor(center(element));
			await sleep(DEMO.cursor.glideMs, signal);
			setPulse(true);
			act(step, element);
			await sleep(step.settleMs, signal);
		}
		setPhase("fading");
		await sleep(DEMO.cursor.fadeMs, signal);
	};

	const start = (button: HTMLElement) => {
		controller.current?.abort();
		const next = new AbortController();
		controller.current = next;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") next.abort();
		};
		window.addEventListener("keydown", onKey);
		setCursor(center(button));
		setPulse(false);
		setPhase("counting");
		run(next.signal)
			.catch(() => undefined)
			.finally(() => {
				window.removeEventListener("keydown", onKey);
				if (controller.current === next) {
					controller.current = null;
					setPhase("idle");
				}
			});
	};

	if (phase === "idle") {
		return (
			<div className="fixed right-6 bottom-6 z-60">
				<Button
					variant="outline"
					size="sm"
					onClick={(event) => start(event.currentTarget)}
				>
					{t("Play demo")}
				</Button>
			</div>
		);
	}

	return (
		<>
			{phase === "counting" ? (
				<p className="fixed right-6 bottom-6 z-60 text-muted-foreground text-sm tabular-nums">
					{t("Starts in {count}", { count: remaining })}
				</p>
			) : null}
			<div
				aria-hidden="true"
				className={cn(
					"pointer-events-none fixed top-0 left-0 z-60 transition-[transform,opacity] ease-in-out",
					phase !== "running" && "opacity-0",
				)}
				style={{
					transform: `translate(${cursor.x}px, ${cursor.y}px)`,
					transitionDuration: `${DEMO.cursor.glideMs}ms, ${DEMO.cursor.fadeMs}ms`,
				}}
			>
				{pulse ? (
					<span
						className="-top-2.5 -left-2.5 absolute size-5 animate-ping rounded-full border-2 border-foreground"
						style={{
							animationIterationCount: 1,
							animationFillMode: "forwards",
						}}
					/>
				) : null}
				<span className="-top-2.5 -left-2.5 absolute size-5 rounded-full border-2 border-background bg-foreground" />
			</div>
		</>
	);
}
