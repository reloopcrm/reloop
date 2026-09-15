import { workspaceRoleOf } from "@crm/auth";
import type { Db } from "@crm/db";
import { rateWindowKey } from "@crm/db/tracking";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { TrackingCounterService } from "../tracking/tracking-counter.service";
import { WAITLIST } from "./waitlist-config";

type Row = { email: string; createdAt: string };

function csvField(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(rows: Row[]): string {
	return [
		"email,created_at",
		...rows.map((row) => [row.email, row.createdAt].map(csvField).join(",")),
	].join("\n");
}

@Injectable()
export class WaitlistService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(TrackingCounterService)
		private readonly counters: TrackingCounterService,
	) {}

	async join(email: string): Promise<void> {
		const allowed = await this.counters.take(
			`${rateWindowKey()}:waitlist-join`,
			WAITLIST.join.perMinute,
		);
		if (!allowed) return;

		await this.db.waitlistSignup.upsert({
			where: { email },
			create: { email },
			update: {},
		});
	}

	async list(userId: string) {
		if ((await workspaceRoleOf(userId, this.db)) !== "owner") {
			throw new ForbiddenException("Only a workspace owner sees the waitlist.");
		}

		const rows = (
			await this.db.waitlistSignup.findMany({
				orderBy: { createdAt: "desc" },
				select: { email: true, createdAt: true },
			})
		).map((row) => ({
			email: row.email,
			createdAt: row.createdAt.toISOString(),
		}));

		return { rows, csv: toCsv(rows) };
	}
}
