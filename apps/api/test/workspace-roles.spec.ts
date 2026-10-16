import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { memberListInput } from "../src/workspace/workspace.contracts";
import { WorkspaceService } from "../src/workspace/workspace.service";

const OUTSIDE = "role read outside the transaction";

function workspace(actorRole: string, targetRole: string, owners = 2) {
	const updates: string[] = [];
	const locks: string[] = [];
	const rows = [
		{ id: "actor", role: actorRole, userId: "actor-user" },
		{ id: "target", role: targetRole, userId: "target-user" },
		...Array.from({ length: owners }, (_, index) => ({
			id: `owner-${index}`,
			role: "owner",
			userId: `owner-${index}-user`,
		})),
	];
	const tx = {
		member: {
			update: async ({ data }: { data: { role: string } }) => {
				updates.push(data.role);
				return {
					id: "target",
					role: data.role,
					createdAt: new Date(0),
					userId: "target-user",
					user: { name: "Target", email: "target@example.com", image: null },
				};
			},
		},
		$queryRaw: async (sql: TemplateStringsArray) => {
			locks.push(sql.join("?"));
			return rows;
		},
	};
	const db = {
		member: {
			findUnique: async () => {
				throw new Error(OUTSIDE);
			},
		},
		$transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
			run(tx),
	} as unknown as Db;
	const unused = undefined as never;

	return { service: new WorkspaceService(db, unused), updates, locks };
}

describe("workspace role changes", () => {
	it("does not let an admin make itself or anyone else an owner", async () => {
		const { service, updates } = workspace("admin", "member");

		await expect(
			service.setMemberRole("actor-user", {
				memberId: "target",
				role: "owner",
			}),
		).rejects.toThrow("Only an owner");
		expect(updates).toEqual([]);
	});

	it("does not let an admin change an owner", async () => {
		const { service, updates } = workspace("admin", "owner");

		await expect(
			service.setMemberRole("actor-user", {
				memberId: "target",
				role: "member",
			}),
		).rejects.toThrow("Only an owner");
		expect(updates).toEqual([]);
	});

	it("lets an admin change a member to an admin", async () => {
		const { service, updates } = workspace("admin", "member");

		await service.setMemberRole("actor-user", {
			memberId: "target",
			role: "admin",
		});
		expect(updates).toEqual(["admin"]);
	});

	it("lets an owner grant and remove ownership", async () => {
		const granted = workspace("owner", "member");
		await granted.service.setMemberRole("actor-user", {
			memberId: "target",
			role: "owner",
		});
		expect(granted.updates).toEqual(["owner"]);

		const demoted = workspace("owner", "owner");
		await demoted.service.setMemberRole("actor-user", {
			memberId: "target",
			role: "admin",
		});
		expect(demoted.updates).toEqual(["admin"]);
	});

	it("reads the caller and the target under a row lock in the transaction", async () => {
		const { service, locks } = workspace("admin", "member");

		await service.setMemberRole("actor-user", {
			memberId: "target",
			role: "admin",
		});

		expect(locks).toHaveLength(1);
		expect(locks[0]).toContain("FOR UPDATE");
	});

	it("keeps the last owner", async () => {
		const { service, updates } = workspace("member", "owner", 0);

		await expect(
			service.setMemberRole("target-user", {
				memberId: "target",
				role: "admin",
			}),
		).rejects.toThrow("The workspace needs an owner.");
		expect(updates).toEqual([]);
	});
});

describe("the member list filter", () => {
	it("takes the workspace roles and refuses any other word", () => {
		expect(memberListInput.parse({ role: ["owner", "admin"] }).role).toEqual([
			"owner",
			"admin",
		]);
		expect(memberListInput.safeParse({ role: ["boss"] }).success).toBe(false);
	});
});
