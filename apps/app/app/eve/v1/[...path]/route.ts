import { db } from "@crm/db";
import { currentTenantId } from "@crm/db/tenant-context";
import { CONVERSATIONS } from "@crm/validation/conversations";
import { connection } from "next/server";
import { z } from "zod";
import {
	AGENT_URL,
	bridgeConfigured,
	mintBridgeToken,
} from "@/lib/agent-bridge";
import { getSession } from "@/lib/session";
import { inTenant } from "@/lib/tenant";

const NOT_SIGNED_IN = () =>
	Response.json({ error: "Not signed in." }, { status: 401 });

async function handler(request: Request): Promise<Response> {
	await connection();

	if (!bridgeConfigured()) {
		return Response.json(
			{ error: "The research agent is not configured for this install." },
			{ status: 503 },
		);
	}

	return (await inTenant(() => bridge(request))) ?? NOT_SIGNED_IN();
}

async function bridge(request: Request): Promise<Response> {
	const session = await getSession();
	if (!session) return NOT_SIGNED_IN();

	const url = new URL(request.url);
	const target = `${AGENT_URL}${url.pathname}${url.search}`;

	const headers = new Headers(request.headers);

	for (const header of [
		"host",
		"cookie",
		"x-forwarded-host",
		"x-forwarded-proto",
		"x-forwarded-for",
		"forwarded",
		"transfer-encoding",
		"connection",
		"keep-alive",
		"content-length",
		"expect",
	]) {
		headers.delete(header);
	}

	const contactId = request.headers.get("x-crm-contact");
	const companyId = request.headers.get("x-crm-company");
	const dealId = request.headers.get("x-crm-deal");
	const builderConversationId = request.headers.get(
		"x-crm-builder-conversation",
	);
	const requestedSession = sessionFromPath(url.pathname);
	headers.delete("x-crm-contact");
	headers.delete("x-crm-company");
	headers.delete("x-crm-deal");
	headers.delete("x-crm-builder-conversation");

	if (requestedSession) {
		const owned = await db.agentConversation.count({
			where: { sessionId: requestedSession, userId: session.user.id },
		});
		if (owned === 0) {
			return Response.json(
				{ error: "Conversation not found." },
				{ status: 404 },
			);
		}
	}

	if (builderConversationId) {
		const conversation = await db.agentConversation.findFirst({
			where: {
				id: builderConversationId,
				userId: session.user.id,
				kind: "BUILDER",
			},
			select: { sessionId: true },
		});
		if (
			!conversation ||
			(requestedSession && conversation.sessionId !== requestedSession)
		) {
			return Response.json(
				{ error: "Conversation not found." },
				{ status: 404 },
			);
		}
	}

	headers.set(
		"authorization",
		`Bearer ${await mintBridgeToken(
			{
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
			},
			{
				contactId: cuid(contactId),
				companyId: cuid(companyId),
				dealId: cuid(dealId),
				tenantId: currentTenantId() ?? undefined,
			},
		)}`,
	);

	const init: RequestInit & { duplex?: "half" } = {
		method: request.method,
		headers,
		redirect: "manual",
		signal: request.signal,
	};

	const creating =
		request.method === "POST" &&
		url.pathname === CREATE_SESSION_PATH &&
		!builderConversationId;
	let opening: string | null = null;

	if (creating) {
		const text = await request.text();
		opening = openingMessage(text);
		init.body = text;
	} else if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
		init.duplex = "half";
	}

	let upstream: Response;
	try {
		upstream = await fetch(target, init);
	} catch (error) {
		return Response.json(
			{
				error: "The research agent is not reachable.",
				detail: error instanceof Error ? error.message : String(error),
			},
			{ status: 502 },
		);
	}

	const responseHeaders = new Headers(upstream.headers);
	for (const header of [
		"transfer-encoding",
		"connection",
		"content-encoding",
		"content-length",
	]) {
		responseHeaders.delete(header);
	}

	if (creating && upstream.ok) {
		const text = await upstream.text();
		const sessionId =
			mintedSessionId(text) ?? upstream.headers.get(SESSION_ID_HEADER)?.trim();
		if (!sessionId) {
			return Response.json(
				{ error: "The research agent did not return a session id." },
				{ status: 502 },
			);
		}
		await db.agentConversation.create({
			data: {
				sessionId,
				userId: session.user.id,
				kind: "RECORD",
				contactId: recordId(contactId),
				companyId: recordId(companyId),
				dealId: recordId(dealId),
				title: opening,
			},
			select: { id: true },
		});
		return new Response(text, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers: responseHeaders,
		});
	}

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: responseHeaders,
	});
}

export {
	handler as DELETE,
	handler as GET,
	handler as HEAD,
	handler as OPTIONS,
	handler as PATCH,
	handler as POST,
	handler as PUT,
};

const CREATE_SESSION_PATH = "/eve/v1/session";
const RESET_SESSION_PATH = "/eve/v1/session/reset";
const SESSION_ID_HEADER = "x-eve-session-id";
const TITLE_LENGTH = CONVERSATIONS.title.maxLength;

function cuid(value: string | null): string | undefined {
	return value && /^[a-z0-9]{20,32}$/.test(value) ? value : undefined;
}

function recordId(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function sessionFromPath(pathname: string): string | null {
	if (pathname === RESET_SESSION_PATH) return null;
	const match = pathname.match(/\/eve\/v1\/session\/([^/]+)/);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const createSessionBody = z.object({
	message: z
		.string()
		.trim()
		.catch("")
		.transform((message) => message.slice(0, TITLE_LENGTH)),
});

const createSessionReply = z.object({
	sessionId: z.string().trim().min(1).catch(""),
});

function parseJson<Schema extends z.ZodType>(
	text: string,
	schema: Schema,
): z.infer<Schema> | null {
	try {
		return schema.parse(JSON.parse(text));
	} catch {
		return null;
	}
}

function openingMessage(body: string): string | null {
	return parseJson(body, createSessionBody)?.message || null;
}

function mintedSessionId(body: string): string | undefined {
	return parseJson(body, createSessionReply)?.sessionId || undefined;
}
