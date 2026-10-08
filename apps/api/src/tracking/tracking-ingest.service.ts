import type { Db } from "@crm/db";
import { classifyTouch, type RawTouch } from "@crm/db/attribution";
import {
	dedupeKey,
	EVENTS_PER_MINUTE,
	FORMS_PER_CLIENT_HOUR,
	FORMS_PER_SITE_HOUR,
	FORMS_PER_VISITOR_HOUR,
	formClientWindowKey,
	formSiteWindowKey,
	formVisitorWindowKey,
	HONEYPOT_FIELD,
	hostAllowed,
	MAX_EVENTS_PER_BATCH,
	matchedHost,
	normalizePath,
	originAllowed,
	rateWindowKey,
	skipText,
	stripQuery,
	TRACKING_SKIP,
	type TrackingConfig,
	type TrackingSkipCode,
} from "@crm/db/tracking";
import type {
	TrackingBatch,
	TrackingEvent,
} from "@crm/validation/tracking-batch";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { type FormFields, nameFrom, storeTouch } from "./stored-submission";
import { TrackingConfigService } from "./tracking-config.service";
import { TrackingCounterService } from "./tracking-counter.service";
import { TrackingFilingService } from "./tracking-filing.service";
import { refilable, TrackingRefileService } from "./tracking-refile.service";

const MAX_LABEL = 80;

const MAX_PATH = 512;

const MAX_HOST = 253;

const BOT = /bot|crawler|spider|crawling|headlesschrome|lighthouse|preview/i;

const SENSITIVE = /pass|secret|token|card|cvv|cvc|ssn|iban|routing/i;

const CARD = /^[0-9 -]{12,25}$/;

const ADDRESS = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

const fieldText = z.string().nullable().catch(null);

export interface TrackingRequest {
	origin: string | null;
	userAgent: string | null;
	clientKey: string | null;
}

interface AcceptedEvent {
	event: TrackingEvent;
	host: string;
}

@Injectable()
export class TrackingIngestService {
	private readonly logger = new Logger(TrackingIngestService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: TrackingConfigService,
		private readonly counters: TrackingCounterService,
		private readonly filing: TrackingFilingService,
		private readonly refile: TrackingRefileService,
	) {}

	async accept(batch: TrackingBatch, request: TrackingRequest): Promise<void> {
		if (request.userAgent && BOT.test(request.userAgent)) return;

		const compiled = await this.config.forSite(batch.siteId);
		if (!compiled) return;

		if (!originAllowed(request.origin, compiled.config)) return;

		const visitorId = sanitizeId(batch.visitorId);
		if (!visitorId) return;

		const events = batch.events.slice(0, MAX_EVENTS_PER_BATCH);
		if (scripted(events)) return;

		const accepted = events.flatMap<AcceptedEvent>((event) => {
			const host = event.host.toLowerCase().trim().slice(0, MAX_HOST);

			return host && hostAllowed(host, compiled.config) && !trapped(event)
				? [{ event, host }]
				: [];
		});

		if (accepted.length === 0) return;
		if (!(await this.withinRate(accepted.length))) return;

		const pageViews = accepted.filter(
			({ event }) => event.type === "page_view" || event.type === "click",
		);
		const forms = accepted.filter(({ event }) => event.type === "form_submit");

		if (pageViews.length > 0) {
			await this.events(visitorId, pageViews, compiled.config);
		}

		for (const form of forms) {
			const within = await this.withinFormRate(
				visitorId,
				batch.siteId,
				request.clientKey,
			);

			await this.submission(
				visitorId,
				form,
				within ? null : TRACKING_SKIP.formCap,
			);
		}

		await this.refile.drainDue();
	}

	private async withinFormRate(
		visitorId: string,
		siteId: string,
		clientKey: string | null,
	): Promise<boolean> {
		const at = new Date();

		if (clientKey) {
			const perClient = await this.counters.take(
				formClientWindowKey(clientKey, at),
				FORMS_PER_CLIENT_HOUR,
			);

			if (!perClient) return false;
		}

		const perVisitor = await this.counters.take(
			formVisitorWindowKey(visitorId, at),
			FORMS_PER_VISITOR_HOUR,
		);

		if (!perVisitor) return false;

		return this.counters.take(
			formSiteWindowKey(siteId, at),
			FORMS_PER_SITE_HOUR,
		);
	}

	private async events(
		visitorId: string,
		accepted: AcceptedEvent[],
		config: TrackingConfig,
	): Promise<void> {
		const rows = accepted.map(({ event, host }) => {
			const touch =
				event.type === "page_view" && event.touch
					? classifyTouch(arriving(event.touch))
					: null;

			const referrer = stripQuery(event.referrer);

			return {
				visitorId,
				type: event.type,
				host,
				path: trim(normalizePath(event.path), MAX_PATH),
				referrer: referrer ? trim(referrer, MAX_PATH) : null,
				label: event.label ? trim(event.label, MAX_LABEL) : null,
				source: touch?.source ?? null,
				medium: touch?.medium ?? null,
				campaign: touch?.campaign ?? null,
				occurredAt: occurredAt(event.at),
			};
		});

		await this.db.trackedEvent.createMany({ data: rows });

		await this.countViews(rows, config);
	}

	private async countViews(
		rows: { host: string; type: string }[],
		config: TrackingConfig,
	): Promise<void> {
		const tallies = new Map<string, number>();

		for (const row of rows) {
			const entry = matchedHost(row.host, config);
			if (!entry) continue;

			const views = tallies.get(entry.host) ?? 0;
			tallies.set(entry.host, views + (row.type === "page_view" ? 1 : 0));
		}

		const lastSeenAt = new Date();

		await Promise.all(
			[...tallies].map(([host, views]) =>
				this.db.trackedDomain.updateMany({
					where: { host },
					data: { pageViews: { increment: views }, lastSeenAt },
				}),
			),
		);
	}

	private async submission(
		visitorId: string,
		{ event, host }: AcceptedEvent,
		deferred: TrackingSkipCode | null,
	): Promise<void> {
		const fields = clean(event.fields ?? {});
		const email = emailFrom(fields);
		const path = trim(normalizePath(event.path), MAX_PATH);
		const at = occurredAt(event.at);

		const lastTouch = classifyTouch(arriving(event.touch ?? {}), at);
		const firstTouch = event.firstTouch
			? classifyTouch(arriving(event.firstTouch), at)
			: lastTouch;

		const key = dedupeKey({ host, path, email, visitorId, at });

		const created = await this.db.formSubmission.createMany({
			data: [
				{
					visitorId,
					host,
					path,
					email,
					fields,
					firstTouch: storeTouch(firstTouch),
					lastTouch: storeTouch(lastTouch),
					dedupeKey: key,
					skipReason: deferred,
				},
			],
			skipDuplicates: true,
		});

		if (deferred) {
			if (created.count > 0) {
				this.logger.log({
					message: "Form submission stored and deferred",
					host,
					reason: deferred,
					detail: skipText(deferred),
				});
			}

			return;
		}

		const submission = await this.db.formSubmission.findUnique({
			where: { dedupeKey: key },
			select: { id: true, filedAt: true, skipReason: true },
		});

		if (!submission) return;
		if (created.count === 0 && !refilable(submission)) return;

		const outcome = await this.filing.file({
			id: submission.id,
			email,
			host,
			visitorId,
			name: nameFrom(fields),
			firstTouch,
			lastTouch,
		});

		if (!outcome.filed) {
			this.logger.log({
				message: "Form submission stored but not filed",
				host,
				reason: outcome.reason,
				detail: skipText(outcome.reason),
			});
		}
	}

	private async withinRate(events: number): Promise<boolean> {
		return this.counters.take(rateWindowKey(), EVENTS_PER_MINUTE, events);
	}
}

function trapped(event: TrackingEvent): boolean {
	if (event.type !== "form_submit") return false;

	return (event.fields?.[HONEYPOT_FIELD] ?? "").trim() !== "";
}

function arriving(touch: RawTouch): RawTouch {
	return {
		...touch,
		referrer: stripQuery(touch.referrer) ?? undefined,
		landing: stripQuery(touch.landing) ?? undefined,
	};
}

function scripted(events: TrackingEvent[]): boolean {
	if (events.length < 3) return false;

	const stamps = events.flatMap((event) =>
		event.at !== undefined && Number.isFinite(event.at) ? [event.at] : [],
	);

	if (stamps.length !== events.length) return false;

	return new Set(stamps).size === 1;
}

function occurredAt(at: number | undefined): Date {
	const now = Date.now();
	if (at === undefined || !Number.isFinite(at)) return new Date(now);

	const bounded = Math.min(Math.max(at, now - 86_400_000), now);

	return new Date(bounded);
}

function trim(value: string, max: number): string {
	return value.length > max ? value.slice(0, max) : value;
}

function sanitizeId(value: string | undefined): string | null {
	const trimmed = fieldText.parse(value)?.trim() ?? "";

	return /^[a-zA-Z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

function clean(fields: FormFields): FormFields {
	const kept: FormFields = {};

	for (const [key, value] of Object.entries(fields).slice(0, 40)) {
		const text = fieldText.parse(value);
		if (text === null) continue;
		if (key === HONEYPOT_FIELD) continue;
		if (SENSITIVE.test(key)) continue;
		if (CARD.test(text.trim())) continue;

		kept[trim(key, 64)] = trim(text, 512);
	}

	return kept;
}

function emailFrom(fields: FormFields): string | null {
	for (const [key, value] of Object.entries(fields)) {
		if (!/mail/i.test(key)) continue;
		const email = address(value);
		if (email) return email;
	}

	for (const value of Object.values(fields)) {
		const email = address(value);
		if (email) return email;
	}

	return null;
}

function address(value: string): string | null {
	const email = normalizeEmail(value);

	return email && ADDRESS.test(email) ? email : null;
}
