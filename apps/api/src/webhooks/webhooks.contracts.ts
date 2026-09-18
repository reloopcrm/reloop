import { CRM_EVENT_TYPES } from "@crm/db/crm-events";
import { WEBHOOKS } from "@crm/db/webhooks";
import { z } from "zod";

const webhookUrl = z
	.string()
	.trim()
	.url()
	.max(WEBHOOKS.url.maxLength)
	.refine((value) => {
		const target = new URL(value);
		return (
			(WEBHOOKS.url.protocols as readonly string[]).includes(target.protocol) &&
			!target.username &&
			!target.password
		);
	}, "A webhook address is an http or https address without a user name in it.");

const webhookEvents = z.array(z.enum(CRM_EVENT_TYPES)).min(1).max(20);

const webhookSecret = z
	.string()
	.trim()
	.min(WEBHOOKS.secret.minLength)
	.max(WEBHOOKS.secret.maxLength);

export const webhookIdInput = z.object({ id: z.string().min(1) });

export const createWebhookInput = z.object({
	url: webhookUrl,
	events: webhookEvents,
	secret: webhookSecret,
	allowPrivateHost: z.boolean(),
});

export const updateWebhookInput = z.object({
	id: z.string().min(1),
	url: webhookUrl.optional(),
	events: webhookEvents.optional(),
	secret: webhookSecret.optional(),
	enabled: z.boolean().optional(),
	allowPrivateHost: z.boolean().optional(),
});

export const webhookOutput = z.object({
	id: z.string(),
	url: z.string().nullable(),
	events: z.array(z.enum(CRM_EVENT_TYPES)),
	enabled: z.boolean(),
	allowPrivateHost: z.boolean(),
	secretHint: z.string().nullable(),
	lastDeliveryAt: z.string().nullable(),
	lastStatus: z.number().nullable(),
	lastError: z.string().nullable(),
	createdAt: z.string(),
});

export const webhooksStatusOutput = z.object({
	webhooks: z.array(webhookOutput),
	canManage: z.boolean(),
});

export const webhookRemoveOutput = z.object({ removed: z.boolean() });

export type CreateWebhookInput = z.infer<typeof createWebhookInput>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookInput>;
export type WebhookOutput = z.infer<typeof webhookOutput>;
export type WebhooksStatus = z.infer<typeof webhooksStatusOutput>;
export type WebhookRemoveOutput = z.infer<typeof webhookRemoveOutput>;
