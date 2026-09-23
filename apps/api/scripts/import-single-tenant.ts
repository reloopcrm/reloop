import "@crm/env/load";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { IMPORT } from "../src/tenancy/tenancy.config";

export const USAGE = [
	"Usage: bun scripts/import-single-tenant.ts --dump <file.sql> --tenant <id> --slug <slug> --sign-in <address,domain,...> [--dry-run]",
	"",
	"  --dump      a plain pg_dump of the single-tenant database (--format=plain --no-owner --no-privileges)",
	"  --tenant    the new tenant id, lower case, dashes allowed",
	"  --slug      the workspace slug in the app",
	"  --sign-in   the addresses and domains that sign in to this workspace",
	"  --dry-run   do everything in <db>_dryrun_test, print the report, drop it",
	"",
	`Needs RELOOP_REGISTRY_URL, RELOOP_TENANT_DATABASE_URL_TEMPLATE, BETTER_AUTH_SECRET and ${IMPORT.oldSecretVar}`,
	`(the old install's BETTER_AUTH_SECRET) in the environment. The old secret is never a flag.`,
].join("\n");

export type Command = {
	dump: string;
	tenant: string;
	slug: string;
	signIn: string[];
	dryRun: boolean;
};

const FLAGS = ["--dump", "--tenant", "--slug", "--sign-in"] as const;

export function parseArgs(argv: readonly string[]): Command {
	const values = new Map<string, string>();
	let dryRun = false;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (!FLAGS.includes(arg as (typeof FLAGS)[number])) throw new Error(USAGE);
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) throw new Error(USAGE);
		values.set(arg, value);
		index += 1;
	}

	const dump = values.get("--dump");
	const tenant = values.get("--tenant");
	const slug = values.get("--slug");
	const signIn = (values.get("--sign-in") ?? "")
		.split(",")
		.map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
		.filter(Boolean);
	if (!dump || !tenant || !slug || signIn.length === 0) throw new Error(USAGE);

	return { dump, tenant, slug, signIn, dryRun };
}

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is not set.`);
	return value;
}

export function restoreDump(url: string, file: string): Promise<void> {
	const target = new URL(url);
	target.searchParams.delete("schema");

	return new Promise((resolve, reject) => {
		const child = spawn(
			"psql",
			[
				"--variable=ON_ERROR_STOP=1",
				"--single-transaction",
				"--quiet",
				`--file=${file}`,
				`--dbname=${target.toString()}`,
			],
			{
				stdio: ["ignore", "ignore", "pipe"],
				timeout: IMPORT.restore.timeoutMs,
			},
		);
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (error) =>
			reject(new Error(`psql did not run: ${error.message}`)),
		);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`psql failed (exit ${code}):\n${stderr.trim()}`));
		});
	});
}

type Settled = {
	plan: string | null;
	sessions: number;
	siteId: string | null;
	grants: string[];
};

async function settle(url: string): Promise<Settled> {
	const pg = (await import("pg")).default;
	const { SETTINGS_ID } = await import("@crm/db/settings");
	const client = new pg.Client({ connectionString: url });
	await client.connect();
	try {
		const settings = await client.query<{
			plan: string | null;
			trackingSiteId: string | null;
			signInAddresses: string[] | null;
		}>(
			'SELECT plan, "trackingSiteId", "signInAddresses" FROM "appSetting" WHERE id = $1',
			[SETTINGS_ID],
		);
		const row = settings.rows[0];
		await client.query('UPDATE "appSetting" SET plan = NULL WHERE id = $1', [
			SETTINGS_ID,
		]);
		const sessions = await client.query('DELETE FROM "session"');
		return {
			plan: row?.plan ?? null,
			sessions: sessions.rowCount ?? 0,
			siteId: row?.trackingSiteId?.trim() || null,
			grants: row?.signInAddresses ?? [],
		};
	} finally {
		await client.end();
	}
}

async function main(): Promise<void> {
	const command = parseArgs(process.argv.slice(2));
	const oldSecret = requiredEnv(IMPORT.oldSecretVar);
	const newSecret = requiredEnv("BETTER_AUTH_SECRET");
	if (!existsSync(command.dump)) {
		throw new Error(`${command.dump} does not exist.`);
	}

	const provision = await import("@crm/db/provision");
	const registry = await import("@crm/db/tenancy");
	const { TENANCY } = await import("@crm/db/tenancy-config");
	const { disconnectAll } = await import("@crm/db/client");
	const { resealDatabase, resealSummary } = await import(
		"../src/tenancy/reseal-secrets"
	);

	try {
		await registry.ensureRegistrySchema();
		if (await registry.tenantById(command.tenant)) {
			throw new Error(
				`Tenant ${command.tenant} already exists. Nothing was changed.`,
			);
		}

		const dbName = command.dryRun
			? `${provision.dbNameOf(command.tenant)}${IMPORT.dryRunSuffix}`
			: provision.dbNameOf(command.tenant);
		const url = registry.tenantDatabaseUrl(dbName);
		if (command.dryRun) await provision.dropDatabase(url);
		if (!(await provision.createDatabase(url))) {
			throw new Error(
				`Database ${dbName} already exists. Drop it or choose another tenant id. Nothing was changed.`,
			);
		}

		try {
			console.log(`Restoring ${command.dump} into ${dbName}`);
			await restoreDump(url, command.dump);

			console.log("Applying the cloud's migrations");
			const migrated = await provision.migrateDatabase(url);
			console.log(migrated ? "Migrated." : "Schema already current.");

			console.log("Re-sealing secrets with the cloud secret");
			const lines = await resealDatabase(url, oldSecret, newSecret);
			for (const line of resealSummary(lines)) console.log(line);

			const settled = await settle(url);
			console.log(
				`AppSetting.plan was ${settled.plan ?? "empty"}, now empty: no limits.`,
			);
			console.log(
				`${settled.sessions} sessions deleted. Everyone signs in again.`,
			);
			console.log(
				"API keys keep their hash, but carry no tenant prefix. Create them again in Settings.",
			);
			console.log(
				"Stored OAuth apps (Google, Microsoft, Slack secrets) are re-sealed but not read on the cloud. The cloud's own env pairs apply.",
			);

			const allowList = [...new Set([...command.signIn, ...settled.grants])];
			const failed = lines.filter((line) => line.status === "failed");

			if (command.dryRun) {
				await provision.dropDatabase(url);
				console.log(`Dry run: ${dbName} dropped. Nothing was registered.`);
				console.log(
					`The real run registers tenant ${command.tenant} (${command.slug}) as active without a plan, sign-in ${allowList.join(", ")}${settled.siteId ? `, tracking site ${settled.siteId}` : ""}.`,
				);
			} else {
				const tenant = await registry.createTenant({
					id: command.tenant,
					slug: command.slug,
					dbName,
					allowList,
					plan: TENANCY.operator.plan,
					status: "active",
					siteIds: settled.siteId ? [settled.siteId] : [],
				});
				console.log(
					`Tenant ${tenant.id} registered: ${tenant.dbName}, status ${tenant.status}, sign-in ${tenant.allowList.join(", ")}.`,
				);
				console.log(
					`Set RELOOP_OPERATOR_TENANT="${tenant.id}" on api, app and agent, then restart them.`,
				);
			}

			if (failed.length > 0) {
				console.error(
					`${failed.length} secrets could not be re-sealed and keep their old value. Enter them again in Settings.`,
				);
				process.exitCode = 1;
			}
		} catch (error) {
			await provision.dropDatabase(url).catch(() => undefined);
			throw error;
		}
	} finally {
		await disconnectAll();
		await registry.closeRegistry();
	}
}

function fail(error: Error): void {
	console.error(error.message);
	process.exitCode = 1;
}

if (import.meta.main) await main().catch(fail);
