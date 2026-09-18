import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { WorkspaceService } from "../src/workspace/workspace.service";

const suffix = process.env.TEST_RUN_ID ?? "add-person-spec";
const domain = `people-${suffix}.example.com`;
const ownerId = `${suffix}-owner`;
const adminId = `${suffix}-admin`;

const service = new WorkspaceService(
	db,
	undefined as unknown as AgentTriggerService,
);

const seedActor = async (id: string, role: string) => {
	await db.user.create({
		data: {
			id,
			name: id,
			email: `${id}@${domain}`,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	await db.member.create({
		data: {
			id: `member-${id}`,
			organizationId: WORKSPACE_ID,
			userId: id,
			role,
			createdAt: new Date(),
		},
	});
};

const clear = async () => {
	await db.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
};

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

	await clear();
	await seedActor(ownerId, "owner");
	await seedActor(adminId, "admin");
});

afterAll(clear);

const userFor = (email: string) =>
	db.user.findFirst({ where: { email }, select: { id: true } });

describe("workspace.addPerson", () => {
	it("refuses an admin who tries to create an owner, and creates nothing", async () => {
		const email = `boss@${domain}`;

		await expect(
			service.addPerson(
				adminId,
				{ email, name: "Boss", role: "owner" },
				new Date(),
			),
		).rejects.toThrow("Only an owner");

		expect(await userFor(email)).toBeNull();
	});

	it("refuses an address the allow list refuses, names the value and creates nothing", async () => {
		const email = "stranger@outside.test";

		const refusal = service.addPerson(
			ownerId,
			{ email, name: "Stranger", role: "member" },
			new Date(),
		);

		await expect(refusal).rejects.toThrow("ALLOWED_SIGN_IN");
		await expect(refusal).rejects.toThrow(email);
		await expect(refusal).rejects.toThrow("deploy/.env");

		expect(await userFor(email)).toBeNull();
	});

	it("gives the new person a member row with the role that was asked for", async () => {
		const email = `rep@${domain}`;

		const added = await service.addPerson(
			ownerId,
			{ email, name: "Rep", role: "admin" },
			new Date(),
		);

		expect(added.member.email).toBe(email);
		expect(added.member.role).toBe("admin");
		expect(added.password.length).toBeGreaterThan(11);

		const user = await userFor(email);
		expect(user).not.toBeNull();

		const member = await db.member.findUnique({
			where: {
				organizationId_userId: {
					organizationId: WORKSPACE_ID,
					userId: user?.id ?? "",
				},
			},
			select: { role: true },
		});

		expect(member?.role).toBe("admin");

		const credential = await db.account.findFirst({
			where: { userId: user?.id ?? "", providerId: "credential" },
			select: { password: true },
		});

		expect(credential?.password).toBeTruthy();
		expect(credential?.password).not.toBe(added.password);
	});

	it("refuses a session that is not fresh", async () => {
		await expect(
			service.addPerson(
				ownerId,
				{ email: `late@${domain}`, name: "Late", role: "member" },
				new Date(Date.now() - 60 * 60_000),
			),
		).rejects.toThrow("Sign out and sign in again");

		expect(await userFor(`late@${domain}`)).toBeNull();
	});
});
