import { type Db, db } from "@crm/db";
import { disconnectAll } from "@crm/db/client";
import { closeRegistry, pingRegistry } from "@crm/db/tenancy";
import { isHosted } from "@crm/db/tenant-context";
import {
	Global,
	Logger,
	Module,
	type OnApplicationShutdown,
	type OnModuleInit,
} from "@nestjs/common";
import { DATABASE, InjectDatabase } from "./database.constants";

@Global()
@Module({
	providers: [{ provide: DATABASE, useValue: db }],
	exports: [DATABASE],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
	private readonly logger = new Logger(DatabaseModule.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async onModuleInit(): Promise<void> {
		try {
			if (isHosted()) {
				await pingRegistry();
				this.logger.log({ message: "Tenant registry connected" });
				return;
			}
			await this.db.$connect();
			this.logger.log({ message: "Database connected" });
		} catch (error) {
			this.logger.fatal(
				{ message: "Database connection failed" },
				error instanceof Error ? error.stack : String(error),
			);
			throw error;
		}
	}

	async onApplicationShutdown(signal?: string): Promise<void> {
		if (isHosted()) {
			await disconnectAll();
			await closeRegistry();
		} else {
			await this.db.$disconnect();
		}
		this.logger.log({ message: "Database disconnected", signal });
	}
}
