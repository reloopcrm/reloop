import "@crm/env/load";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client";
import { type Tenant, tenantDatabaseUrl } from "./tenancy";
import { TENANCY } from "./tenancy-config";
import { currentTenant, isHosted, tenantHeld } from "./tenant-context";

function connectionString(): string {
	return process.env.NODE_ENV === "test" ? testDatabase() : liveDatabase();
}

function liveDatabase(): string {
	const url = process.env.DATABASE_URL;

	if (!url) {
		throw new Error(
			"DATABASE_URL is not set. Copy .env.example to .env at the root of the repo and fill it in, or set DATABASE_URL in the environment.",
		);
	}

	return url;
}

function testDatabase(): string {
	const url = process.env.TEST_DATABASE_URL;

	if (!url) {
		throw new Error(
			[
				"TEST_DATABASE_URL is not set, and the suite will not fall back to DATABASE_URL.",
				"",
				"These are real integration tests. They delete every workspace member and the",
				"organization row and put them back when the run finishes — so a run that is",
				"interrupted leaves everybody locked out of whatever database it was pointed at.",
				"The pre-push hook runs them, so that is one `git push` away from a database you",
				"care about.",
				"",
				"Make a throwaway one and point TEST_DATABASE_URL at it:",
				"",
				"    bun run db:test",
				"",
			].join("\n"),
		);
	}

	if (!databaseName(url).endsWith("_test")) {
		throw new Error(
			`TEST_DATABASE_URL must name a database ending in _test, so it cannot be one somebody is using. It names "${databaseName(url)}".`,
		);
	}

	return url;
}

function databaseName(url: string): string {
	try {
		return new URL(url).pathname.replace(/^\//, "");
	} catch {
		return url;
	}
}

export interface PrismaLogRecord {
	level: Prisma.LogLevel;
	message: string;
	target: string;
	durationMs?: number;
}

export type PrismaLogSink = (record: PrismaLogRecord) => void;

const consoleSink: PrismaLogSink = ({ level, message, target, durationMs }) => {
	const suffix = durationMs === undefined ? "" : ` (+${durationMs}ms)`;
	const line = `[prisma:${level}] ${message}${suffix} [${target}]`;

	if (level === "error") {
		console.error(line);
	} else if (level === "warn") {
		console.warn(line);
	} else {
		console.log(line);
	}
};

let sink: PrismaLogSink = consoleSink;

export function setPrismaLogSink(next: PrismaLogSink | null): void {
	sink = next ?? consoleSink;
}

const logQueries = process.env.PRISMA_LOG_QUERIES === "true";

const logDefinitions: Prisma.LogDefinition[] = [
	{ level: "warn", emit: "event" },
	{ level: "error", emit: "event" },
	...(logQueries
		? ([
				{ level: "query", emit: "event" },
				{ level: "info", emit: "event" },
			] satisfies Prisma.LogDefinition[])
		: []),
];

const createPrismaClient = (connectionString: string, max?: number) => {
	const client = new PrismaClient({
		adapter: new PrismaPg({ connectionString, max }),
		log: logDefinitions,
	});

	client.$on("error", ({ message, target }) => {
		sink({ level: "error", message, target });
	});
	client.$on("warn", ({ message, target }) => {
		sink({ level: "warn", message, target });
	});
	client.$on("info", ({ message, target }) => {
		sink({ level: "info", message, target });
	});
	client.$on("query", ({ query, duration, target }) => {
		sink({ level: "query", message: query, target, durationMs: duration });
	});

	return client;
};

export type Db = ReturnType<typeof createPrismaClient>;

declare global {
	var prisma: Db | undefined;
}

let single: Db | undefined = isHosted() ? undefined : singleClient();

function singleClient(): Db {
	const client = globalThis.prisma ?? createPrismaClient(connectionString());
	if (process.env.NODE_ENV !== "production") globalThis.prisma = client;
	return client;
}

const clients = new Map<string, Db>();

function clientFor(tenant: Tenant): Db {
	const existing = clients.get(tenant.id);
	if (existing) {
		clients.delete(tenant.id);
		clients.set(tenant.id, existing);
		return existing;
	}

	const client = createPrismaClient(
		tenantDatabaseUrl(tenant.dbName),
		TENANCY.pool.api,
	);
	clients.set(tenant.id, client);

	if (clients.size > TENANCY.clients.max) evictIdle();

	return client;
}

function evictIdle(): void {
	for (const [id, idle] of clients) {
		if (tenantHeld(id)) continue;
		clients.delete(id);
		void idle.$disconnect();
		return;
	}
}

function resolve(): Db {
	if (isHosted()) return clientFor(currentTenant());
	single ??= singleClient();
	return single;
}

export function openClients(): string[] {
	return [...clients.keys()];
}

export async function disconnectAll(): Promise<void> {
	const open = [...clients.values()];
	clients.clear();
	if (single) open.push(single);
	await Promise.all(open.map((client) => client.$disconnect()));
}

const delegates = new Set(
	Object.values(Prisma.ModelName).map(
		(model) => model.charAt(0).toLowerCase() + model.slice(1),
	),
);

const isClientProperty = (property: string | symbol): boolean =>
	String(property).startsWith("$") || delegates.has(String(property));

export const db: Db = new Proxy({} as Db, {
	get(target, property, receiver) {
		if (Reflect.has(target, property)) {
			return Reflect.get(target, property, receiver);
		}
		if (!isClientProperty(property)) return undefined;
		const client = resolve();
		const value = Reflect.get(client, property, client);
		return value instanceof Function ? value.bind(client) : value;
	},
	has(target, property) {
		return Reflect.has(target, property) || isClientProperty(property);
	},
});
