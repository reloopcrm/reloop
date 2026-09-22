import type { NextRequest } from "next/server";
import { z } from "zod";
import { API_URL } from "@/lib/env";

export const ONBOARDING_PATH = "/onboarding";

export const CONNECTIONS_PATH = "/settings/connections";

export const PAUSED_PATH = "/paused";

const SUSPENDED = { status: 403, message: "TENANT_SUSPENDED" } as const;

const refusal = z.object({ message: z.string() }).catch({ message: "" });

const GATE_TIMEOUT_MS = 2_000;

export type Gate = "settled" | "required" | "suspended" | "unknown";

const procedureResult = z
	.object({ result: z.object({ data: z.json() }).catch({ data: null }) })
	.catch({ result: { data: null } });

const workspaceAnswer = z
	.object({
		onboarded: z.boolean().nullable().catch(null),
		canRename: z.boolean().nullable().catch(null),
		slug: z.string().min(1).nullable().catch(null),
	})
	.catch({ onboarded: null, canRename: null, slug: null });

async function read(request: NextRequest, procedure: string) {
	const cookie = request.headers.get("cookie");

	if (!cookie) return null;

	try {
		const response = await fetch(`${API_URL}/api/trpc/${procedure}`, {
			headers: { cookie },
			cache: "no-store",
			signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
		});

		if (response.status === SUSPENDED.status) {
			const body = refusal.parse(await response.json().catch(() => ({})));
			return body.message === SUSPENDED.message ? SUSPENDED.message : null;
		}

		if (!response.ok) return null;

		return procedureResult.parse(await response.json()).result.data;
	} catch {
		return null;
	}
}

export type WorkspaceGate = { gate: Gate; slug: string | null };

export async function readWorkspaceGate(
	request: NextRequest,
): Promise<WorkspaceGate> {
	const answer = await read(request, "workspace.get");
	if (answer === SUSPENDED.message) return { gate: "suspended", slug: null };

	const workspace = workspaceAnswer.parse(answer);

	const slug = workspace.slug;

	if (workspace.onboarded === null) {
		return { gate: "unknown", slug };
	}

	return {
		gate:
			workspace.onboarded || workspace.canRename !== true
				? "settled"
				: "required",
		slug,
	};
}
