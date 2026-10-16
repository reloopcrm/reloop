import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { WorkspaceService } from "../src/workspace/workspace.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ROUNDS = 10;
const ownerId = `race-owner-${RUN}`;
const adminId = `race-admin-${RUN}`;
const targetIds = Array.from(
	{ length: ROUNDS },
	(_, index) => `race-target-${index}-${RUN}`,
);
const people = [ownerId, adminId, ...targetIds];

const service = new WorkspaceService(
	db,
	undefined as unknown as AgentTriggerService,
);

async function seed(id: string, role: string): Promise<string> {
	await db.user.create({
		data: {
			id,
			name: id,
			email: `preview-${id}@example.com`,
			emailVerified: true,
			updatedAt: new Date(),
		},
	});
	const member = await db.member.create({
		data: {
			id: `member-${id}`,
			organizationId: WORKSPACE_ID,
			userId: id,
			role,
			createdAt: new Date(),
		},
		select: { id: true },
	});
	return member.id;
}

async function clean() {
	await db.session.deleteMany({ where: { userId: { in: people } } });
	await db.apikey.deleteMany({ where: { referenceId: { in: people } } });
	await db.member.deleteMany({ where: { userId: { in: people } } });
	await db.user.deleteMany({ where: { id: { in: people } } });
}

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await clean();
	await seed(ownerId, "owner");
	await seed(adminId, "admin");
});

afterAll(clean);

describe("an admin removes a member while an owner promotes them", () => {
	it("never lets the admin remove someone who just became an owner", async () => {
		for (const targetId of targetIds) {
			const memberId = await seed(targetId, "member");

			const [promotion, removal] = await Promise.allSettled([
				service.setMemberRole(ownerId, { memberId, role: "owner" }),
				service.removeMember(adminId, { memberId }),
			]);

			const row = await db.member.findUnique({
				where: { id: memberId },
				select: { role: true },
			});

			expect(
				promotion.status === "fulfilled" && removal.status === "fulfilled",
			).toBe(false);

			if (removal.status === "fulfilled") expect(row).toBeNull();
			else expect(row?.role).toBe("owner");
		}
	});
});
