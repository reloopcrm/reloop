import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ensureWorkspaceMembership,
	setPasswordFor,
	TENANT_COOKIE_NAME,
	tenantCookieValue,
} from "@crm/auth";
import { db } from "@crm/db";
import { addOnLookupKey, planLookupKey } from "@crm/db/pricing";
import * as provision from "@crm/db/provision";
import {
	closeRegistry,
	forgetTenants,
	NO_BILLING,
	removeTenant,
	type Tenant,
	tenantById,
	tenantDatabaseUrl,
	writeTenantBilling,
} from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { prepareTestTenants } from "@crm/db/test-tenants";
import pg from "pg";
import type Stripe from "stripe";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { STRIPE } from "../src/billing/stripe.provider";
import { type Mail, MailService } from "../src/mail/mail.service";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";
import { TenantSweepService } from "../src/tenancy/tenant-sweep.service";
import type { DeleteWorkspaceInput } from "../src/workspace/workspace.contracts";
import { WorkspaceDeletionService } from "../src/workspace/workspace-deletion.service";

const PREPARE_TIMEOUT_MS = 240_000;
const RUN = crypto.randomUUID().slice(0, 8);
const PASSWORD = "ein-sehr-langes-passwort-zum-loeschen";
const DELETED_SUBJECT = "Reloop: your workspace was deleted";
const PERIOD_END = 1_800_000_000;

type Disposable = {
	id: string;
	name: string;
	owner: { id: string; email: string };
	member: { id: string; email: string };
	subscriptionId: string;
};

const happy: Disposable = disposable("a");
const retry: Disposable = disposable("b");

function disposable(letter: string): Disposable {
	const id = `del-${letter}-${RUN}`;
	return {
		id,
		name: `Delete ${letter.toUpperCase()} ${RUN}`,
		owner: { id: `${id}-owner`, email: `owner@${id}.example` },
		member: { id: `${id}-member`, email: `member@${id}.example` },
		subscriptionId: `sub_${letter}_${RUN}`,
	};
}

function subscriptionOf(
	target: Disposable,
	status: Stripe.Subscription.Status,
	schedule: string | null,
): Stripe.Subscription {
	return {
		id: target.subscriptionId,
		object: "subscription",
		customer: `cus_${target.id}`,
		status,
		cancel_at: null,
		cancel_at_period_end: false,
		schedule,
		metadata: { tenantId: target.id },
		items: {
			data: [
				{
					id: "si_plan",
					quantity: 1,
					current_period_end: PERIOD_END,
					price: {
						id: "price_plan",
						lookup_key: planLookupKey("standard", "month"),
					},
				},
				{
					id: "si_drafts",
					quantity: 1,
					current_period_end: PERIOD_END,
					price: {
						id: "price_drafts",
						lookup_key: addOnLookupKey("drafts", "month"),
					},
				},
			],
		},
	} as unknown as Stripe.Subscription;
}

const saved = {
	registry: process.env.RELOOP_REGISTRY_URL,
	template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	stripeKey: process.env.STRIPE_SECRET_KEY,
	webhook: process.env.STRIPE_WEBHOOK_SECRET,
	backups: process.env.RELOOP_BACKUP_DIR,
	resend: process.env.RESEND_API_KEY,
	from: process.env.MAIL_FROM,
	operator: process.env.RELOOP_OPERATOR_TENANT,
};

const spies: { mockRestore: () => void }[] = [];
const cancels: { id: string; params: Stripe.SubscriptionCancelParams }[] = [];
const released: string[] = [];
const mails: Mail[] = [];
const tenants = new Map<string, Tenant>();
const subscriptions = new Map<string, Stripe.Subscription>();
let backupDir = "";
let app: Awaited<ReturnType<typeof import("../src/create-app").createApp>>;
let server: ReturnType<typeof app.getHttpServer>;

function required<T>(value: T | undefined | null, what: string): T {
	if (value === undefined || value === null) throw new Error(`${what} missing`);
	return value;
}

const tenantCookie = (id: string) =>
	`${TENANT_COOKIE_NAME}=${tenantCookieValue(id, process.env.BETTER_AUTH_SECRET ?? "")}`;

const signedIn = new Map<string, string>();

async function signIn(target: Disposable, email: string): Promise<string> {
	const known = signedIn.get(email);
	if (known) return known;
	const response = await request(server)
		.post("/api/auth/sign-in/email")
		.set("cookie", tenantCookie(target.id))
		.send({ email, password: PASSWORD });
	expect(response.status).toBe(200);
	const session = String(response.headers["set-cookie"])
		.split(",")
		.map((part) => part.split(";")[0]?.trim() ?? "")
		.filter((part) => part.includes("session_token"))
		.join("; ");
	const cookie = `${tenantCookie(target.id)}; ${session}`;
	signedIn.set(email, cookie);
	return cookie;
}

function deleteRequest(cookie: string, body: DeleteWorkspaceInput) {
	return request(server)
		.post("/api/trpc/workspace.delete")
		.set("cookie", cookie)
		.send(body);
}

async function databaseExists(target: Disposable): Promise<boolean> {
	const url = new URL(tenantDatabaseUrl(provision.dbNameOf(target.id)));
	const name = url.pathname.slice(1);
	url.pathname = "/postgres";
	url.search = "";
	const client = new pg.Client({ connectionString: url.toString() });
	await client.connect();
	try {
		const found = await client.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[name],
		);
		return (found.rowCount ?? 0) > 0;
	} finally {
		await client.end();
	}
}

async function wipe(target: Disposable): Promise<void> {
	await removeTenant(target.id).catch(() => undefined);
	await provision
		.dropDatabase(tenantDatabaseUrl(provision.dbNameOf(target.id)))
		.catch(() => undefined);
}

async function provisionDisposable(target: Disposable): Promise<Tenant> {
	const tenant = await provision.provisionTenant({
		id: target.id,
		slug: target.id,
		dbName: provision.dbNameOf(target.id),
		allowList: [`${target.id}.example`],
		status: "active",
		plan: "trial",
		name: target.name,
	});
	await runAsTenant(tenant, async () => {
		for (const [person, role] of [
			[target.owner, "owner"],
			[target.member, "member"],
		] as const) {
			await db.user.create({
				data: {
					id: person.id,
					email: person.email,
					name: person.email,
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await ensureWorkspaceMembership(person.id);
			await db.member.updateMany({
				where: { userId: person.id },
				data: { role },
			});
			await setPasswordFor(person.id, PASSWORD);
		}
		await db.imapAccount.create({
			data: {
				userId: target.owner.id,
				email: target.owner.email,
				host: "imap.example",
				username: target.owner.email,
				secret: "sealed-test-secret",
			},
		});
	});
	await writeTenantBilling(target.id, {
		plan: "standard",
		paidUntil: new Date(PERIOD_END * 1000),
		graceUntil: null,
		billing: {
			...NO_BILLING,
			customerId: `cus_${target.id}`,
			subscriptionId: target.subscriptionId,
			status: "active",
			interval: "month",
		},
	});
	subscriptions.set(
		target.subscriptionId,
		subscriptionOf(target, "active", `sched_${target.id}`),
	);
	writeFileSync(
		join(backupDir, `${provision.dbNameOf(target.id)}-nightly.dump`),
		"",
	);
	return required(await tenantById(target.id), target.id);
}

function stubStripe(stripe: Stripe) {
	return [
		spyOn(stripe.subscriptions, "retrieve").mockImplementation((async (
			id: string,
		) => required(subscriptions.get(id), id)) as never),
		spyOn(stripe.subscriptions, "cancel").mockImplementation((async (
			id: string,
			params: Stripe.SubscriptionCancelParams,
		) => {
			cancels.push({ id, params });
			const live = required(subscriptions.get(id), id);
			const canceled = { ...live, status: "canceled", schedule: null };
			subscriptions.set(id, canceled as Stripe.Subscription);
			return canceled;
		}) as never),
		spyOn(stripe.subscriptionSchedules, "retrieve").mockImplementation((async (
			id: string,
		) => ({
			id,
			object: "subscription_schedule",
			status: released.includes(id) ? "released" : "active",
			current_phase: { start_date: PERIOD_END - 100, end_date: PERIOD_END },
			phases: [],
		})) as never),
		spyOn(stripe.subscriptionSchedules, "release").mockImplementation((async (
			id: string,
		) => {
			released.push(id);
			return { id, status: "released" };
		}) as never),
	];
}

function deletedMails(target: Disposable): Mail[] {
	return mails.filter(
		(mail) =>
			mail.subject === DELETED_SUBJECT && mail.to === target.owner.email,
	);
}

beforeAll(async () => {
	backupDir = mkdtempSync(join(tmpdir(), "reloop-deletion-"));
	process.env.STRIPE_SECRET_KEY = "sk_test_placeholder_never_real";
	process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_only_never_real";
	process.env.RELOOP_BACKUP_DIR = backupDir;
	process.env.RESEND_API_KEY = "re_test_placeholder_never_real";
	process.env.MAIL_FROM = "Reloop <preview@example.com>";

	await prepareTestTenants();
	await wipe(happy);
	await wipe(retry);
	tenants.set(happy.id, await provisionDisposable(happy));
	tenants.set(retry.id, await provisionDisposable(retry));

	spies.push(
		spyOn(
			DispatchHeartbeatService.prototype,
			"onApplicationBootstrap",
		).mockImplementation(() => {}),
		spyOn(
			MailboxSyncHeartbeatService.prototype,
			"onApplicationBootstrap",
		).mockImplementation(() => {}),
		spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
			() => {},
		),
	);

	const { createApp } = await import("../src/create-app");
	app = await createApp();
	server = app.getHttpServer();
	spies.push(...stubStripe(app.get<Stripe>(STRIPE)));
	spies.push(
		spyOn(app.get(MailService), "send").mockImplementation(
			async (mail: Mail) => {
				mails.push(mail);
				return true;
			},
		),
	);
}, PREPARE_TIMEOUT_MS);

afterAll(async () => {
	try {
		await app?.close();
		await wipe(happy);
		await wipe(retry);
		await closeRegistry();
		rmSync(backupDir, { recursive: true, force: true });
	} finally {
		for (const spy of spies) spy.mockRestore();
		for (const [name, value] of [
			["RELOOP_REGISTRY_URL", saved.registry],
			["RELOOP_TENANT_DATABASE_URL_TEMPLATE", saved.template],
			["STRIPE_SECRET_KEY", saved.stripeKey],
			["STRIPE_WEBHOOK_SECRET", saved.webhook],
			["RELOOP_BACKUP_DIR", saved.backups],
			["RESEND_API_KEY", saved.resend],
			["MAIL_FROM", saved.from],
			["RELOOP_OPERATOR_TENANT", saved.operator],
		] as const) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
});

describe("deleting a workspace", () => {
	it("refuses on a self-hosted install", async () => {
		const registry = process.env.RELOOP_REGISTRY_URL;
		delete process.env.RELOOP_REGISTRY_URL;
		try {
			await expect(
				app.get(WorkspaceDeletionService).delete(happy.owner, {
					name: happy.name,
					reauth: { method: "password", password: PASSWORD },
				}),
			).rejects.toThrow("This workspace cannot be deleted here.");
		} finally {
			process.env.RELOOP_REGISTRY_URL = registry;
		}
		expect(cancels).toHaveLength(0);
	});

	it("refuses a member who is not the owner", async () => {
		const cookie = await signIn(happy, happy.member.email);
		const response = await deleteRequest(cookie, {
			name: happy.name,
			reauth: { method: "password", password: PASSWORD },
		});
		expect(response.status).toBe(403);
		expect(JSON.stringify(response.body)).toContain(
			"Only the owner of the workspace can delete it.",
		);
		expect((await tenantById(happy.id))?.status).toBe("active");
	});

	it("refuses a name that does not match", async () => {
		const cookie = await signIn(happy, happy.owner.email);
		const response = await deleteRequest(cookie, {
			name: `${happy.name} typo`,
			reauth: { method: "password", password: PASSWORD },
		});
		expect(response.status).toBe(400);
		expect((await tenantById(happy.id))?.status).toBe("active");
		expect(cancels).toHaveLength(0);
	});

	it("refuses a wrong password", async () => {
		const cookie = await signIn(happy, happy.owner.email);
		const response = await deleteRequest(cookie, {
			name: happy.name,
			reauth: { method: "password", password: `${PASSWORD}-wrong` },
		});
		expect(response.status).toBe(400);
		expect((await tenantById(happy.id))?.status).toBe("active");
		expect(cancels).toHaveLength(0);
	});

	it("refuses the operator workspace", async () => {
		const cookie = await signIn(happy, happy.owner.email);
		process.env.RELOOP_OPERATOR_TENANT = happy.id;
		try {
			const response = await deleteRequest(cookie, {
				name: happy.name,
				reauth: { method: "password", password: PASSWORD },
			});
			expect(response.status).toBe(403);
		} finally {
			if (saved.operator === undefined)
				delete process.env.RELOOP_OPERATOR_TENANT;
			else process.env.RELOOP_OPERATOR_TENANT = saved.operator;
		}
		expect((await tenantById(happy.id))?.status).toBe("active");
		expect(cancels).toHaveLength(0);
	});

	it("cancels billing, ends sessions, drops the database and mails once", async () => {
		const cookie = await signIn(happy, happy.owner.email);
		const response = await deleteRequest(cookie, {
			name: happy.name,
			reauth: { method: "password", password: PASSWORD },
		});

		expect(response.status).toBe(200);
		expect(response.body.result.data).toEqual({ finished: true });
		expect(String(response.headers["set-cookie"])).toContain(
			`${TENANT_COOKIE_NAME}=; Path=/; Max-Age=0`,
		);
		expect(cancels).toEqual([
			{
				id: happy.subscriptionId,
				params: { prorate: false, invoice_now: false },
			},
		]);
		expect(released).toContain(`sched_${happy.id}`);
		forgetTenants();
		expect(await tenantById(happy.id)).toBeNull();
		expect(await databaseExists(happy)).toBe(false);
		expect(deletedMails(happy)).toHaveLength(1);

		const after = await request(server)
			.get("/api/trpc/users.me")
			.set("cookie", cookie);
		expect(after.status).toBe(401);
	}, 120_000);

	it("finishes on the next sweep after a failure halfway, with one mail", async () => {
		const tenant = required(tenants.get(retry.id), retry.id);
		const deletion = app.get(WorkspaceDeletionService);
		const owner = { id: retry.owner.id, email: retry.owner.email };
		await runAsTenant(tenant, () =>
			db.account.deleteMany({
				where: { userId: owner.id, providerId: "credential" },
			}),
		);
		await runAsTenant(tenant, () => deletion.sendCode(owner, "en"));
		const code = required(
			mails
				.filter((mail) => mail.to === owner.email)
				.at(-1)
				?.text.match(/^\d{6}$/m)?.[0],
			"code",
		);

		const dump = spyOn(provision, "dumpDatabase").mockImplementation(() =>
			Promise.reject(new provision.DumpUnavailable("disk full")),
		);
		const recent = spyOn(provision, "recentDump").mockImplementation(
			() => null,
		);
		try {
			const outcome = await runAsTenant(tenant, () =>
				deletion.delete(owner, {
					name: retry.name,
					reauth: { method: "code", code },
				}),
			);
			expect(outcome).toEqual({ finished: false });
		} finally {
			dump.mockRestore();
			recent.mockRestore();
		}

		forgetTenants();
		expect((await tenantById(retry.id))?.status).toBe("deleted");
		expect(await databaseExists(retry)).toBe(true);
		expect(
			cancels.filter((call) => call.id === retry.subscriptionId),
		).toHaveLength(1);
		const leftovers = await runAsTenant(tenant, async () => ({
			sessions: await db.session.count(),
			imap: await db.imapAccount.count(),
		}));
		expect(leftovers).toEqual({ sessions: 0, imap: 0 });
		expect(deletedMails(retry)).toHaveLength(1);

		const ownerMails = mails.filter((mail) => mail.to === owner.email).length;
		const stripe = app.get<Stripe>(STRIPE);
		const payload = JSON.stringify({
			id: `evt_deleted_${RUN}`,
			object: "event",
			type: "customer.subscription.deleted",
			data: {
				object: required(subscriptions.get(retry.subscriptionId), "sub"),
			},
		});
		const webhook = await request(server)
			.post("/api/billing/webhook")
			.set(
				"stripe-signature",
				await stripe.webhooks.generateTestHeaderStringAsync({
					payload,
					secret: required(process.env.STRIPE_WEBHOOK_SECRET, "secret"),
				}),
			)
			.set("content-type", "application/json")
			.send(payload);
		expect(webhook.status).toBe(200);
		forgetTenants();
		expect((await tenantById(retry.id))?.status).toBe("deleted");
		expect(mails.filter((mail) => mail.to === owner.email)).toHaveLength(
			ownerMails,
		);

		const unauthorized = await request(server)
			.get("/api/trpc/users.me")
			.set("cookie", tenantCookie(retry.id));
		expect(unauthorized.status).toBe(403);

		await app.get(TenantSweepService).sweep(new Date());

		forgetTenants();
		expect(await tenantById(retry.id)).toBeNull();
		expect(await databaseExists(retry)).toBe(false);
		expect(
			cancels.filter((call) => call.id === retry.subscriptionId),
		).toHaveLength(1);
		expect(deletedMails(retry)).toHaveLength(1);
	}, 120_000);
});
