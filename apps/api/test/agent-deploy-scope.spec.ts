import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentDefinitionsService } from "../src/agent/agent-definitions.service";

const USER_ID = "deploy-scope-user";

function manifest(mode: "SELECTED" | "WORKSPACE") {
	return {
		actions: [
			{
				type: "slack.message.post",
				provider: "slack",
				summary: "Post the summary",
				destination: {
					kind: "channel",
					resolution: "chosen",
					id: "C1",
					label: "#sales",
				},
			},
		],
		triggers: [
			{
				type: "MANUAL",
				name: "Run now",
				summary: "A person starts it",
				config: {},
			},
		],
		dataScope: {
			mode,
			summary: mode === "WORKSPACE" ? "Every record" : "One company",
			resources:
				mode === "WORKSPACE"
					? []
					: [{ id: "c1", kind: "company", label: "Acme" }],
		},
	};
}

function agents(role: string, mode: "SELECTED" | "WORKSPACE") {
	const deployed: string[] = [];
	const tx = {
		$queryRaw: async (strings: TemplateStringsArray) =>
			strings.join("").includes('FROM "member"')
				? [{ role }]
				: [
						{
							id: "agent-1",
							status: "LIVE",
							name: "Renewals",
							description: null,
							currentVersionId: null,
						},
					],
		agentDefinition: {
			findFirst: async () => ({
				id: "agent-1",
				createdById: USER_ID,
				status: "LIVE",
				name: "Renewals",
				description: null,
			}),
			update: async () => {
				deployed.push("definition");
				return {};
			},
		},
		agentAuditEvent: {
			findFirst: async () => null,
			create: async () => ({}),
		},
		agentVersion: {
			findFirst: async () => ({
				id: "version-1",
				number: 1,
				status: "READY",
				manifest: manifest(mode),
			}),
			update: async () => ({}),
			updateMany: async () => ({ count: 0 }),
		},
		agentTrigger: { updateMany: async () => ({ count: 0 }) },
	};
	const db = {
		$transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
			run(tx),
	} as unknown as Db;
	const unused = undefined as never;

	return {
		service: new AgentDefinitionsService(
			db,
			new AgentAccessService(db),
			unused,
		),
		deployed,
	};
}

describe("deploying an agent that reads the whole workspace", () => {
	it("refuses a member, even the one who created it", async () => {
		const { service, deployed } = agents("member", "WORKSPACE");

		await expect(
			service.deploy(
				{
					id: "agent-1",
					versionId: "version-1",
					clientRequestId: "request-1",
				},
				USER_ID,
			),
		).rejects.toThrow("Only an owner or an admin");
		expect(deployed).toEqual([]);
	});

	it("lets a member deploy an agent that reads chosen records", async () => {
		const { service, deployed } = agents("member", "SELECTED");

		await service.deploy(
			{ id: "agent-1", versionId: "version-1", clientRequestId: "request-1" },
			USER_ID,
		);
		expect(deployed).toEqual(["definition"]);
	});

	it("lets an admin deploy it", async () => {
		const { service, deployed } = agents("admin", "WORKSPACE");

		await service.deploy(
			{ id: "agent-1", versionId: "version-1", clientRequestId: "request-1" },
			USER_ID,
		);
		expect(deployed).toEqual(["definition"]);
	});

	it("refuses a member when the manifest cannot be read", () => {
		const access = new AgentAccessService(undefined as never);

		expect(() => access.assertCanDeploy("member", { broken: true })).toThrow(
			"Only an owner or an admin",
		);
	});
});
