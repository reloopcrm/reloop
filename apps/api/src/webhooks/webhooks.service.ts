import { canManageConnections } from "@crm/auth";
import type { Db, WebhookModel } from "@crm/db";
import { isCrmEventType } from "@crm/db/crm-events";
import { maskKey } from "@crm/db/settings";
import { openWebhookSecret, sealWebhookSecret } from "@crm/db/webhooks";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentAccessService } from "../agent/agent-access.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	CreateWebhookInput,
	UpdateWebhookInput,
	WebhookOutput,
	WebhookRemoveOutput,
	WebhooksStatus,
} from "./webhooks.contracts";

@Injectable()
export class WebhooksService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
	) {}

	async status(userId: string): Promise<WebhooksStatus> {
		const role = await this.access.assertMember(userId);
		const webhooks = await this.db.webhook.findMany({
			orderBy: { createdAt: "asc" },
		});

		return {
			webhooks: webhooks.map(present),
			canManage: canManageConnections(role),
		};
	}

	async create(
		userId: string,
		input: CreateWebhookInput,
	): Promise<WebhooksStatus> {
		await this.assertManager(userId);

		await this.db.webhook.create({
			data: {
				url: input.url,
				events: input.events,
				secret: sealWebhookSecret(input.secret),
				allowPrivateHost: input.allowPrivateHost,
			},
		});

		return this.status(userId);
	}

	async update(
		userId: string,
		input: UpdateWebhookInput,
	): Promise<WebhooksStatus> {
		await this.assertManager(userId);

		const { count } = await this.db.webhook.updateMany({
			where: { id: input.id },
			data: {
				url: input.url,
				events: input.events,
				enabled: input.enabled,
				allowPrivateHost: input.allowPrivateHost,
				secret: input.secret ? sealWebhookSecret(input.secret) : undefined,
			},
		});

		if (count === 0) throw new NotFoundException("No webhook with that id.");

		return this.status(userId);
	}

	async remove(userId: string, id: string): Promise<WebhookRemoveOutput> {
		await this.assertManager(userId);

		const { count } = await this.db.webhook.deleteMany({ where: { id } });
		if (count === 0) throw new NotFoundException("No webhook with that id.");

		return { removed: true };
	}

	private async assertManager(userId: string): Promise<void> {
		const role = await this.access.assertMember(userId);

		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change a webhook.",
			);
		}
	}
}

function present(webhook: WebhookModel): WebhookOutput {
	return {
		id: webhook.id,
		url: webhook.url,
		events: webhook.events.filter(isCrmEventType),
		enabled: webhook.enabled,
		allowPrivateHost: webhook.allowPrivateHost,
		secretHint: hintOf(webhook.secret),
		lastDeliveryAt: webhook.lastDeliveryAt?.toISOString() ?? null,
		lastStatus: webhook.lastStatus,
		lastError: webhook.lastError,
		createdAt: webhook.createdAt.toISOString(),
	};
}

function hintOf(secret: string): string {
	try {
		return maskKey(openWebhookSecret(secret));
	} catch {
		return maskKey("");
	}
}
