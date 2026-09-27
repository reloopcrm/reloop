import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import type { Db } from "@crm/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { WorkspaceService } from "../src/workspace/workspace.service";

type Target = { role: string; userId: string };

function workspace(actorRole: string, target: Target, owners = 2) {
	const writes: string[] = [];
	const tx = {
		member: {
			findFirst: async () => ({
				id: "target",
				role: target.role,
				userId: target.userId,
				user: { email: "target@example.com" },
			}),
			delete: async () => writes.push("member"),
		},
		user: { update: async () => writes.push("user") },
		session: { deleteMany: async () => writes.push("session") },
		apikey: { deleteMany: async () => writes.push("apikey") },
		$queryRaw: async () =>
			Array.from({ length: owners }, (_, index) => ({ id: `owner-${index}` })),
	};
	const db = {
		member: { findUnique: async () => ({ role: actorRole }) },
		appSetting: { findUnique: async () => ({ signInAddresses: [] }) },
		$transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
			run(tx),
	} as unknown as Db;
	const unused = undefined as never;

	return { service: new WorkspaceService(db, unused), writes };
}

describe("removing a member: the rules", () => {
	it("refuses a member", async () => {
		const { service, writes } = workspace("member", {
			role: "member",
			userId: "target-user",
		});

		await expect(
			service.removeMember("member-user", { memberId: "target" }),
		).rejects.toThrow("Only an owner or an admin can remove a member.");
		expect(writes).toEqual([]);
	});

	it("refuses to remove yourself", async () => {
		const { service, writes } = workspace("owner", {
			role: "owner",
			userId: "owner-user",
		});

		await expect(
			service.removeMember("owner-user", { memberId: "target" }),
		).rejects.toThrow("You cannot remove yourself from the workspace.");
		expect(writes).toEqual([]);
	});

	it("does not let an admin remove an owner", async () => {
		const { service, writes } = workspace("admin", {
			role: "owner",
			userId: "target-user",
		});

		await expect(
			service.removeMember("admin-user", { memberId: "target" }),
		).rejects.toThrow("Only an owner can remove an owner.");
		expect(writes).toEqual([]);
	});

	it("keeps the last owner", async () => {
		const { service, writes } = workspace(
			"owner",
			{ role: "owner", userId: "target-user" },
			1,
		);

		await expect(
			service.removeMember("owner-user", { memberId: "target" }),
		).rejects.toThrow("The workspace needs an owner.");
		expect(writes).toEqual([]);
	});

	it("lets an admin remove a member", async () => {
		const { service, writes } = workspace("admin", {
			role: "member",
			userId: "target-user",
		});

		await service.removeMember("admin-user", { memberId: "target" });
		expect(writes).toEqual(["member", "user", "session", "apikey"]);
	});

	it("lets an owner remove another owner", async () => {
		const { service, writes } = workspace("owner", {
			role: "owner",
			userId: "target-user",
		});

		await service.removeMember("owner-user", { memberId: "target" });
		expect(writes).toEqual(["member", "user", "session", "apikey"]);
	});
});

describe("removing a member: access goes, data stays", () => {
	const RUN = crypto.randomUUID().slice(0, 8);
	const PASSWORD = "ein-sehr-langes-passwort-zum-entfernen";
	const owner = {
		id: `remove-owner-${RUN}`,
		email: `remove-owner-${RUN}@example.com`,
	};
	const member = {
		id: `remove-member-${RUN}`,
		email: `remove-member-${RUN}@example.com`,
	};
	const contactId = `remove-contact-${RUN}`;
	const apiKeyId = `remove-key-${RUN}`;
	let app: INestApplication;
	let ownerCookie = "";
	let memberCookie = "";
	let memberRowId = "";

	async function clean() {
		const { db } = await import("@crm/db");
		const ids = [owner.id, member.id];
		await db.contact.deleteMany({ where: { id: contactId } });
		await db.apikey.deleteMany({ where: { referenceId: { in: ids } } });
		await db.session.deleteMany({ where: { userId: { in: ids } } });
		await db.account.deleteMany({ where: { userId: { in: ids } } });
		await db.member.deleteMany({ where: { userId: { in: ids } } });
		await db.user.deleteMany({ where: { id: { in: ids } } });
	}

	async function signIn(email: string) {
		return request(app.getHttpServer())
			.post("/api/auth/sign-in/email")
			.send({ email, password: PASSWORD });
	}

	beforeAll(async () => {
		const { db } = await import("@crm/db");
		const { ensureWorkspaceMembership, setPasswordFor, WORKSPACE_ID } =
			await import("@crm/auth");
		const { BackfillService } = await import(
			"../src/backfill/backfill.service"
		);
		spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
			() => {},
		);
		const { AppModule } = await import("../src/app.module");

		await clean();
		for (const person of [owner, member]) {
			await db.user.create({
				data: {
					id: person.id,
					email: person.email,
					name: person.id,
					emailVerified: true,
					updatedAt: new Date(),
				},
			});
			await setPasswordFor(person.id, PASSWORD);
			await ensureWorkspaceMembership(person.id);
		}
		await db.member.update({
			where: {
				organizationId_userId: {
					organizationId: WORKSPACE_ID,
					userId: owner.id,
				},
			},
			data: { role: "owner" },
		});
		memberRowId = (
			await db.member.findUniqueOrThrow({
				where: {
					organizationId_userId: {
						organizationId: WORKSPACE_ID,
						userId: member.id,
					},
				},
				select: { id: true },
			})
		).id;
		await db.contact.create({
			data: { id: contactId, firstName: "Kept", ownerId: member.id },
		});
		await db.apikey.create({
			data: {
				id: apiKeyId,
				name: "remove test",
				referenceId: member.id,
				key: `hashed-${RUN}`,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const fixture = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();
		app = fixture.createNestApplication({ bodyParser: false });
		await app.init();

		ownerCookie = String((await signIn(owner.email)).headers["set-cookie"]);
		memberCookie = String((await signIn(member.email)).headers["set-cookie"]);
	});

	afterAll(async () => {
		await clean();
		await app.close();
	});

	it("lets the member in before the removal", async () => {
		await request(app.getHttpServer())
			.get("/api/trpc/workspace.get")
			.set("Cookie", memberCookie)
			.expect(200);
	});

	it("refuses the member when the member tries to remove the owner", async () => {
		const { db } = await import("@crm/db");
		const { WORKSPACE_ID } = await import("@crm/auth");
		const ownerRow = await db.member.findUniqueOrThrow({
			where: {
				organizationId_userId: {
					organizationId: WORKSPACE_ID,
					userId: owner.id,
				},
			},
			select: { id: true },
		});

		const response = await request(app.getHttpServer())
			.post("/api/trpc/workspace.removeMember")
			.set("Cookie", memberCookie)
			.send({ memberId: ownerRow.id });

		expect(response.status).toBe(403);
	});

	it("removes the member, ends the sessions and keeps the records", async () => {
		const { db } = await import("@crm/db");

		await request(app.getHttpServer())
			.post("/api/trpc/workspace.removeMember")
			.set("Cookie", ownerCookie)
			.send({ memberId: memberRowId })
			.expect(200);

		const user = await db.user.findUniqueOrThrow({
			where: { id: member.id },
			select: { removedAt: true },
		});
		expect(user.removedAt).toBeInstanceOf(Date);
		expect(await db.member.count({ where: { userId: member.id } })).toBe(0);
		expect(await db.session.count({ where: { userId: member.id } })).toBe(0);
		expect(await db.apikey.count({ where: { referenceId: member.id } })).toBe(
			0,
		);
		expect(
			await db.contact.findUnique({
				where: { id: contactId },
				select: { ownerId: true },
			}),
		).toEqual({ ownerId: member.id });
	});

	it("refuses the old session cookie", async () => {
		await request(app.getHttpServer())
			.get("/api/trpc/workspace.get")
			.set("Cookie", memberCookie)
			.expect(401);
	});

	it("refuses a new sign-in although the domain is allowed", async () => {
		const { db } = await import("@crm/db");
		const response = await signIn(member.email);

		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.headers["set-cookie"]).toBeUndefined();
		expect(await db.session.count({ where: { userId: member.id } })).toBe(0);
		expect(await db.member.count({ where: { userId: member.id } })).toBe(0);
	});

	it("hides the removed person from the member list", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/trpc/workspace.members")
			.query({ input: JSON.stringify({ q: member.email }) })
			.set("Cookie", ownerCookie)
			.expect(200);

		expect(response.body.result.data.rows).toEqual([]);
	});
});
