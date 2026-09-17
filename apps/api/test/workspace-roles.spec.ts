import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { WorkspaceService } from "../src/workspace/workspace.service";

function workspace(actorRole: string, targetRole: string) {
	const updates: string[] = [];
	const tx = {
		member: {
			findFirst: async () => ({ id: "target", role: targetRole }),
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
		$queryRaw: async () => [{ id: "one" }, { id: "two" }],
	};
	const db = {
		member: { findUnique: async () => ({ role: actorRole }) },
		$transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
			run(tx),
	} as unknown as Db;
	const unused = undefined as never;

	return { service: new WorkspaceService(db, unused), updates };
}

describe("workspace role changes", () => {
	it("does not let an admin make itself or anyone else an owner", async () => {
		const { service, updates } = workspace("admin", "member");

		await expect(
			service.setMemberRole("admin-user", {
				memberId: "target",
				role: "owner",
			}),
		).rejects.toThrow("Only an owner");
		expect(updates).toEqual([]);
	});

	it("does not let an admin change an owner", async () => {
		const { service, updates } = workspace("admin", "owner");

		await expect(
			service.setMemberRole("admin-user", {
				memberId: "target",
				role: "member",
			}),
		).rejects.toThrow("Only an owner");
		expect(updates).toEqual([]);
	});

	it("lets an admin change a member to an admin", async () => {
		const { service, updates } = workspace("admin", "member");

		await service.setMemberRole("admin-user", {
			memberId: "target",
			role: "admin",
		});
		expect(updates).toEqual(["admin"]);
	});

	it("lets an owner grant and remove ownership", async () => {
		const granted = workspace("owner", "member");
		await granted.service.setMemberRole("owner-user", {
			memberId: "target",
			role: "owner",
		});
		expect(granted.updates).toEqual(["owner"]);

		const demoted = workspace("owner", "owner");
		await demoted.service.setMemberRole("owner-user", {
			memberId: "target",
			role: "admin",
		});
		expect(demoted.updates).toEqual(["admin"]);
	});
});
