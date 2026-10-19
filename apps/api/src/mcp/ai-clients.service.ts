import { endAiClientAccessOf, mcpAddress } from "@crm/auth";
import type { Db } from "@crm/db";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { AiClient, McpStatus, RevokeAiClientInput } from "./mcp.contracts";

@Injectable()
export class AiClientsService {
	private readonly logger = new Logger(AiClientsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async status(userId: string): Promise<McpStatus> {
		const consents = await this.db.oauthConsent.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				clientId: true,
				scopes: true,
				createdAt: true,
				client: { select: { name: true, uri: true } },
			},
		});
		const lastUse = await this.db.oauthAccessToken.groupBy({
			by: ["clientId"],
			where: { userId },
			_max: { createdAt: true },
		});
		const usedAt = new Map(
			lastUse.map((row) => [row.clientId, row._max.createdAt] as const),
		);

		return {
			url: mcpAddress(),
			clients: consents.map(
				(consent): AiClient => ({
					id: consent.id,
					clientId: consent.clientId,
					name: consent.client.name,
					uri: consent.client.uri,
					scopes: consent.scopes,
					connectedAt: consent.createdAt.toISOString(),
					lastUsedAt: usedAt.get(consent.clientId)?.toISOString() ?? null,
				}),
			),
		};
	}

	async revoke(
		userId: string,
		input: RevokeAiClientInput,
	): Promise<{ id: string }> {
		const consent = await this.db.oauthConsent.findFirst({
			where: { id: input.id, userId },
			select: { id: true, clientId: true },
		});
		if (!consent) {
			throw new NotFoundException("That AI client is not connected.");
		}

		await endAiClientAccessOf(this.db, [userId], consent.clientId);

		this.logger.log({ message: "AI client revoked", userId });

		return { id: consent.id };
	}
}
