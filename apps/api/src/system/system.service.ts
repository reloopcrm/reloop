import { workspaceRoleOf } from "@crm/auth";
import type { Db } from "@crm/db";
import { crmVersion } from "@crm/telemetry";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { SYSTEM } from "./system.config";
import {
	githubRelease,
	isNewerVersion,
	type UpdateResult,
	type VersionInfo,
} from "./system.contracts";

type ReleaseCheck = {
	latest: string;
	releaseUrl: string;
	checkedAt: string;
};

@Injectable()
export class SystemService {
	private readonly logger = new Logger(SystemService.name);
	private current: string | null = null;
	private lastGood: ReleaseCheck | null = null;
	private nextCheckAt = 0;
	private lastFetchAt = 0;

	constructor(
		@Inject(ConfigService)
		private readonly config: ConfigService<EnvironmentVariables, true>,
		@InjectDatabase() private readonly db: Db,
	) {}

	async version(userId: string, force = false): Promise<VersionInfo> {
		const current = this.currentVersion();
		const checkDisabled =
			this.config.get("RELOOP_UPDATE_CHECK", { infer: true }) === "false";

		const release = checkDisabled ? null : await this.latestRelease(force);
		const updateAvailable = release
			? isNewerVersion(release.latest, current)
			: false;

		return {
			current,
			latest: release?.latest ?? null,
			updateAvailable,
			releaseUrl: release?.releaseUrl ?? null,
			checkedAt: release?.checkedAt ?? null,
			checkDisabled,
			updaterAvailable: updateAvailable && (await this.updaterAnswers(userId)),
		};
	}

	async update(userId: string): Promise<UpdateResult> {
		if (this.managed()) return { status: "refused" };
		if (!(await this.isOwner(userId))) return { status: "refused" };

		const token = this.updaterToken();
		if (!token) return { status: "unavailable" };

		try {
			const response = await fetch(this.updaterUrl(), {
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(SYSTEM.updater.triggerTimeoutMs),
			});
			if (response.ok) return { status: "started" };
			this.logger.warn({
				message: "Updater refused the update",
				status: response.status,
			});
			return { status: "unavailable" };
		} catch (error) {
			if (error instanceof Error && error.name === "TimeoutError") {
				this.logger.log({ message: "Updater is restarting the containers" });
				return { status: "started" };
			}
			this.logger.warn({
				message: "Updater unavailable",
				reason: error instanceof Error ? error.message : String(error),
			});
			return { status: "unavailable" };
		}
	}

	private managed(): boolean {
		return this.config.get("RELOOP_MANAGED", { infer: true }) === "true";
	}

	private async isOwner(userId: string): Promise<boolean> {
		return (await workspaceRoleOf(userId, this.db)) === "owner";
	}

	private updaterToken(): string | null {
		return this.config.get("UPDATER_TOKEN", { infer: true }) || null;
	}

	private updaterUrl(): string {
		const base =
			this.config.get("UPDATER_URL", { infer: true }) ||
			SYSTEM.updater.defaultUrl;
		return new URL(SYSTEM.updater.path, base).toString();
	}

	private async updaterAnswers(userId: string): Promise<boolean> {
		if (this.managed()) return false;
		if (!this.updaterToken()) return false;
		if (!(await this.isOwner(userId))) return false;

		try {
			const response = await fetch(this.updaterUrl(), {
				signal: AbortSignal.timeout(SYSTEM.updater.probeTimeoutMs),
			});
			return response.status === 401;
		} catch {
			return false;
		}
	}

	private currentVersion(): string {
		this.current ??= crmVersion() ?? SYSTEM.version.fallback;
		return this.current;
	}

	private async latestRelease(force: boolean): Promise<ReleaseCheck | null> {
		const now = Date.now();
		const wait = force
			? this.lastFetchAt + SYSTEM.updateCheck.forceMs
			: this.nextCheckAt;
		if (now < wait) return this.lastGood;

		this.lastFetchAt = now;
		const fetched = await this.fetchRelease();

		if (fetched) {
			this.lastGood = fetched;
			this.nextCheckAt = now + SYSTEM.updateCheck.cacheMs;
		} else {
			this.nextCheckAt = now + SYSTEM.updateCheck.retryMs;
		}

		return this.lastGood;
	}

	private async fetchRelease(): Promise<ReleaseCheck | null> {
		try {
			const response = await fetch(SYSTEM.updateCheck.url, {
				headers: {
					accept: "application/vnd.github+json",
					"user-agent": SYSTEM.updateCheck.userAgent,
				},
				signal: AbortSignal.timeout(SYSTEM.updateCheck.timeoutMs),
			});

			if (!response.ok) {
				this.logger.warn({
					message: "Update check refused",
					status: response.status,
				});
				return null;
			}

			const parsed = githubRelease.safeParse(await response.json());

			if (!parsed.success) {
				this.logger.warn({ message: "Update check answer was unreadable" });
				return null;
			}

			return {
				latest: parsed.data.tag_name.replace(/^v/, ""),
				releaseUrl: parsed.data.html_url,
				checkedAt: new Date().toISOString(),
			};
		} catch (error) {
			this.logger.warn({
				message: "Update check unavailable",
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}
}
