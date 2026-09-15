import { mock } from "bun:test";

mock.module("pg", () => ({
	default: {
		Client: class {
			async connect() {}
			async end() {}
			async query(sql: string) {
				if (sql.includes("pg_database")) return { rowCount: 1 };
				if (sql.includes("_prisma_migrations")) return { rows: [] };
				throw new Error(`Unexpected database mutation: ${sql}`);
			}
		},
	},
}));
mock.module("node:child_process", () => ({
	spawnSync: (_command: string, args: string[]) => {
		if (!args.includes("diff"))
			throw new Error("Unexpected migration execution");
		return {
			status: process.argv.includes("--diff-error") ? 1 : 2,
			stderr: "Simulated schema diagnostic",
		};
	},
}));
