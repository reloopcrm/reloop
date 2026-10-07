import { db, type Prisma } from "@crm/db";

const POLL_MS = 10;
const WAIT_LIMIT_MS = 10_000;

type RowGate = {
	waitForBlocked: () => Promise<void>;
	release: () => Promise<void>;
};

export async function holdContactRow(
	contactId: string,
	commit: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<RowGate> {
	let open!: () => void;
	const gate = new Promise<void>((resolve) => {
		open = resolve;
	});
	let held!: (pid: number) => void;
	const holding = new Promise<number>((resolve) => {
		held = resolve;
	});

	const holder = db.$transaction(
		async (tx) => {
			const [row] = await tx.$queryRaw<Array<{ pid: number }>>`
				SELECT pg_backend_pid() AS pid
			`;
			await tx.$queryRaw`SELECT id FROM "contact" WHERE id = ${contactId} FOR UPDATE`;
			held(row?.pid ?? 0);
			await gate;
			await commit(tx);
		},
		{ timeout: WAIT_LIMIT_MS * 2 },
	);

	const pid = await holding;

	return {
		async waitForBlocked() {
			const deadline = Date.now() + WAIT_LIMIT_MS;
			while (Date.now() < deadline) {
				const [row] = await db.$queryRaw<Array<{ blocked: number }>>`
					SELECT count(*)::int AS blocked
					FROM pg_stat_activity
					WHERE ${pid}::int = ANY(pg_blocking_pids(pid))
				`;
				if ((row?.blocked ?? 0) > 0) return;
				await new Promise((resolve) => setTimeout(resolve, POLL_MS));
			}
			throw new Error("Nothing waited on the held contact row.");
		},
		async release() {
			open();
			await holder;
		},
	};
}
