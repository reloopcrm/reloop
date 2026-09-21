import "@crm/env/load";

export const USAGE = [
	"Usage: bun scripts/tenant.ts <command> [args]",
	"",
	"  create <id> <email-or-domain> [--plan trial] [--active]",
	"  migrate <id>",
	"  migrate-all",
	"  suspend <id>",
	"  delete <id> [--dump-dir <dir>]",
	"  list",
	"",
	"Needs RELOOP_REGISTRY_URL and RELOOP_TENANT_DATABASE_URL_TEMPLATE.",
].join("\n");

export type Command =
	| { name: "create"; id: string; entry: string; plan: string; active: boolean }
	| { name: "migrate"; id: string }
	| { name: "migrate-all" }
	| { name: "suspend"; id: string }
	| { name: "delete"; id: string; dumpDir: string | null }
	| { name: "list" };

export function parseArgs(
	argv: readonly string[],
	env: Record<string, string | undefined>,
): Command {
	const [name, ...rest] = argv;
	const flag = (key: string): string | null => {
		const at = rest.indexOf(key);
		return at >= 0 ? (rest[at + 1] ?? null) : null;
	};
	const positional = rest.filter(
		(arg, index) =>
			!arg.startsWith("--") && !(rest[index - 1] ?? "").startsWith("--"),
	);

	switch (name) {
		case "create": {
			const [id, entry] = positional;
			if (!id || !entry) throw new Error(USAGE);
			return {
				name,
				id,
				entry,
				plan: flag("--plan") ?? "trial",
				active: rest.includes("--active"),
			};
		}
		case "migrate":
		case "suspend": {
			const [id] = positional;
			if (!id) throw new Error(USAGE);
			return { name, id };
		}
		case "delete": {
			const [id] = positional;
			if (!id) throw new Error(USAGE);
			return {
				name,
				id,
				dumpDir: flag("--dump-dir") ?? env.RELOOP_BACKUP_DIR ?? null,
			};
		}
		case "migrate-all":
		case "list":
			return { name };
		default:
			throw new Error(USAGE);
	}
}

async function main(): Promise<void> {
	const command = parseArgs(process.argv.slice(2), process.env);
	const provision = await import("@crm/db/provision");
	const registry = await import("@crm/db/tenancy");
	const { disconnectAll } = await import("@crm/db/client");

	const find = async (id: string) => {
		const tenant = await registry.tenantById(id);
		if (!tenant) throw new Error(`No tenant ${id} in the registry.`);
		return tenant;
	};

	try {
		switch (command.name) {
			case "create": {
				if (await registry.tenantById(command.id)) {
					throw new Error(
						`Tenant ${command.id} already exists. Use migrate, suspend or delete.`,
					);
				}
				const tenant = await provision.provisionTenant({
					id: command.id,
					slug: command.id,
					dbName: provision.dbNameOf(command.id),
					allowList: [command.entry],
					plan: command.plan,
					status: command.active ? "active" : "pending",
				});
				console.log(
					`Tenant ${tenant.id} created: ${tenant.dbName}, plan ${tenant.plan}, status ${tenant.status}.`,
				);
				break;
			}
			case "migrate": {
				const tenant = await find(command.id);
				const migrated = await provision.migrateTenant(tenant);
				console.log(
					migrated
						? `Tenant ${tenant.id} migrated.`
						: `Tenant ${tenant.id} is up to date.`,
				);
				break;
			}
			case "migrate-all": {
				const outcomes = await provision.migrateAllTenants();
				for (const outcome of outcomes) {
					console.log(
						outcome.ok
							? `${outcome.tenantId}: ${outcome.migrated ? "migrated" : "up to date"}`
							: `${outcome.tenantId}: migration_failed\n${outcome.error}`,
					);
				}
				const failed = outcomes.filter((outcome) => !outcome.ok).length;
				console.log(`${outcomes.length} tenants, ${failed} failed.`);
				process.exitCode = failed > 0 ? 1 : 0;
				break;
			}
			case "suspend": {
				const tenant = await find(command.id);
				await registry.setTenantStatus(tenant.id, "suspended");
				console.log(`Tenant ${tenant.id} suspended.`);
				break;
			}
			case "delete": {
				const tenant = await find(command.id);
				const { dump } = await provision.deleteTenant(tenant, {
					dumpDir: command.dumpDir,
				});
				console.log(
					`Tenant ${tenant.id} deleted.${dump ? ` Dump: ${dump}` : ""}`,
				);
				break;
			}
			case "list": {
				const tenants = await registry.allTenants();
				for (const tenant of tenants) {
					console.log(
						[
							tenant.id,
							tenant.status,
							tenant.plan,
							tenant.dbName,
							tenant.trialEndsAt?.toISOString().slice(0, 10) ?? "-",
							tenant.allowList.join(","),
						].join("\t"),
					);
				}
				console.log(`${tenants.length} tenants.`);
				break;
			}
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
