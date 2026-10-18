import { canManageConnections } from "@crm/auth";
import type { Db } from "@crm/db";
import { maskKey, SETTINGS_ID } from "@crm/db/settings";
import { openTypesafeKey, sealTypesafeKey } from "@crm/db/typesafe";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { AgentAccessService } from "../agent/agent-access.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	SaveTypesafeKeyInput,
	TypesafeStatus,
} from "./typesafe.contracts";

@Injectable()
export class TypesafeService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
	) {}

	async status(userId: string): Promise<TypesafeStatus> {
		const role = await this.access.assertMember(userId);
		const row = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { typesafeApiKey: true },
		});
		const stored = row?.typesafeApiKey?.trim() ?? null;
		const canManage = canManageConnections(role);

		return {
			connected: Boolean(stored),
			keyHint: stored && canManage ? hintOf(stored) : null,
			canManage,
		};
	}

	async save(
		userId: string,
		input: SaveTypesafeKeyInput,
	): Promise<TypesafeStatus> {
		await this.assertManager(userId);
		await this.write(sealTypesafeKey(input.apiKey));

		return this.status(userId);
	}

	async disconnect(userId: string): Promise<TypesafeStatus> {
		await this.assertManager(userId);
		await this.write(null);

		return this.status(userId);
	}

	private write(value: string | null): Promise<unknown> {
		return this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, typesafeApiKey: value },
			update: { typesafeApiKey: value },
		});
	}

	private async assertManager(userId: string): Promise<void> {
		const role = await this.access.assertMember(userId);

		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change the TypeSafe connection.",
			);
		}
	}
}

function hintOf(stored: string): string {
	try {
		return maskKey(openTypesafeKey(stored));
	} catch {
		return maskKey("");
	}
}
