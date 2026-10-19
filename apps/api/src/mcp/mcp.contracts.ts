import { z } from "zod";

export const aiClientOutput = z.object({
	id: z.string(),
	clientId: z.string(),
	name: z.string().nullable(),
	uri: z.string().nullable(),
	scopes: z.array(z.string()),
	connectedAt: z.string(),
	lastUsedAt: z.string().nullable(),
});

export type AiClient = z.infer<typeof aiClientOutput>;

export const mcpStatusOutput = z.object({
	url: z.string(),
	clients: z.array(aiClientOutput),
});

export type McpStatus = z.infer<typeof mcpStatusOutput>;

export const revokeAiClientInput = z.object({ id: z.string().min(1) });

export type RevokeAiClientInput = z.infer<typeof revokeAiClientInput>;

export const revokeAiClientOutput = z.object({ id: z.string() });
