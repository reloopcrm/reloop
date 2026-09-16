import { crmVersion } from "@crm/telemetry";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";
import { SYSTEM } from "./system.config";
import {
	githubRelease,
	isNewerVersion,
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
	) {}

	async version(force = false): Promise<VersionInfo> {
		const current = this.currentVersion();
		const checkDisabled =
			this.config.get("RELOOP_UPDATE_CHECK", { infer: true }) === "false";

		const release = checkDisabled ? null : await this.latestRelease(force);

		return {
			current,
			latest: release?.latest ?? null,
			updateAvailable: release
				? isNewerVersion(release.latest, current)
				: false,
			releaseUrl: release?.releaseUrl ?? null,
			checkedAt: release?.checkedAt ?? null,
			checkDisabled,
		};
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
