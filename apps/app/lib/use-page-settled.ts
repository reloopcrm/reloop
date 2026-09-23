"use client";

import { useSyncExternalStore } from "react";

let settled = false;

export function usePageSettled(): boolean {
	return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

function subscribe(notify: () => void): () => void {
	if (settled) return () => undefined;

	let idle: number | null = null;

	const settle = () => {
		settled = true;
		notify();
	};

	const waitForIdle = () => {
		idle = window.requestIdleCallback
			? window.requestIdleCallback(settle)
			: window.setTimeout(settle, 0);
	};

	if (document.readyState === "complete") {
		waitForIdle();
	} else {
		window.addEventListener("load", waitForIdle, { once: true });
	}

	return () => {
		window.removeEventListener("load", waitForIdle);
		if (idle === null) return;
		if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
		else window.clearTimeout(idle);
	};
}

function clientSnapshot(): boolean {
	return settled;
}

function serverSnapshot(): boolean {
	return false;
}
