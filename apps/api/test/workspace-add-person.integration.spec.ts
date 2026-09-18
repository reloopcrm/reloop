import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { type Db, db, type Prisma } from "@crm/db";
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
	await db.user.deleteMany({
		where: { email: { endsWith: `-${suffix}@outside.test` } },
	});
	await db.appSetting.updateMany({ data: { signInAddresses: [] } });
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

const session = (createdAt = new Date()) => ({
	createdAt,
	token: "browser-session-token",
});

const userFor = (email: string) =>
	db.user.findFirst({ where: { email }, select: { id: true } });

const REFUSED = "member write refused";

const brokenMemberWrite = {
	user: {
		findFirst: db.user.findFirst.bind(db.user),
		delete: async () => {
			throw new Error("the cleanup delete also failed");
		},
	},
	member: {
		findUnique: db.member.findUnique.bind(db.member),
		create: async () => {
			throw new Error(REFUSED);
		},
	},
	$transaction: <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) =>
		db.$transaction((tx) =>
			run({
				user: tx.user,
				account: tx.account,
				member: {
					create: async () => {
						throw new Error(REFUSED);
					},
				},
			} as unknown as Prisma.TransactionClient),
		),
} as unknown as Db;

describe("workspace.addPerson", () => {
	it("refuses an admin who tries to create an owner, and creates nothing", async () => {
		const email = `boss@${domain}`;

		await expect(
			service.addPerson(
				adminId,
				{ email, name: "Boss", role: "owner" },
				session(),
			),
		).rejects.toThrow("Only an owner");

		expect(await userFor(email)).toBeNull();
	});

	it("refuses an admin who names an address the allow list refuses, and creates nothing", async () => {
		const email = "stranger@outside.test";

		const refusal = service.addPerson(
			adminId,
			{ email, name: "Stranger", role: "member" },
			session(),
		);

		await expect(refusal).rejects.toThrow("ALLOWED_SIGN_IN");
		await expect(refusal).rejects.toThrow(email);
		await expect(refusal).rejects.toThrow("deploy/.env");

		expect(await userFor(email)).toBeNull();
	});

	it("lets an owner grant an address the allow list refuses", async () => {
		const email = `granted-${suffix}@outside.test`;

		const added = await service.addPerson(
			ownerId,
			{ email, name: "Granted", role: "member" },
			session(),
		);

		expect(added.member.email).toBe(email);
		expect(await userFor(email)).not.toBeNull();
	});

	it("gives the new person a member row with the role that was asked for", async () => {
		const email = `rep@${domain}`;

		const added = await service.addPerson(
			ownerId,
			{ email, name: "Rep", role: "admin" },
			session(),
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

	it("leaves no user row behind when the member write fails", async () => {
		const email = `halfway@${domain}`;
		const broken = new WorkspaceService(
			brokenMemberWrite,
			undefined as unknown as AgentTriggerService,
		);

		await expect(
			broken.addPerson(
				ownerId,
				{ email, name: "Halfway", role: "member" },
				session(),
			),
		).rejects.toThrow(REFUSED);

		expect(await userFor(email)).toBeNull();
	});

	it("refuses a session that is not fresh", async () => {
		await expect(
			service.addPerson(
				ownerId,
				{ email: `late@${domain}`, name: "Late", role: "member" },
				session(new Date(Date.now() - 60 * 60_000)),
			),
		).rejects.toThrow("Sign out and sign in again");

		expect(await userFor(`late@${domain}`)).toBeNull();
	});
});
