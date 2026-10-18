import {
	isWorkspaceAdmin,
	toWorkspaceRole,
	WORKSPACE_ID,
	type WorkspaceRole,
	workspaceRoleOf,
} from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import { agentManifest } from "@crm/validation/agent-manifest";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { canReadAgent, isPrivateAgentDraft } from "./agent-visibility";

@Injectable()
export class AgentAccessService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async assertMember(userId: string): Promise<WorkspaceRole> {
		const role = await workspaceRoleOf(userId);

		if (!role) {
			throw new ForbiddenException("You are not a member of this workspace.");
		}

		return role;
	}

	async assertCanManageInTransaction(
		tx: Prisma.TransactionClient,
		agentId: string,
		userId: string,
	) {
		const [member] = await tx.$queryRaw<Array<{ role: string }>>`
			SELECT role
			FROM "member"
			WHERE "organizationId" = ${WORKSPACE_ID}
				AND "userId" = ${userId}
			FOR SHARE
		`;

		if (!member) {
			throw new ForbiddenException("You are not a member of this workspace.");
		}

		const role = toWorkspaceRole(member.role);
		const agent = await tx.agentDefinition.findFirst({
			where: { id: agentId, status: { not: "DELETED" } },
			select: {
				id: true,
				createdById: true,
				status: true,
				name: true,
				description: true,
			},
		});

		if (!agent) {
			throw new NotFoundException(`No agent with id ${agentId}.`);
		}

		if (isPrivateAgentDraft(agent.status) && agent.createdById !== userId) {
			throw new NotFoundException(`No agent with id ${agentId}.`);
		}

		if (agent.createdById !== userId && !isWorkspaceAdmin(role)) {
			throw new ForbiddenException(
				"Only the creator or a workspace admin can change this agent.",
			);
		}

		return { ...agent, role };
	}

	assertCanDeploy(role: WorkspaceRole, manifest: Prisma.JsonValue): void {
		if (isWorkspaceAdmin(role)) return;

		const parsed = agentManifest.safeParse(manifest);

		if (!parsed.success || parsed.data.dataScope.mode === "WORKSPACE") {
			throw new ForbiddenException(
				"Only an owner or an admin can deploy an agent that reads the whole workspace.",
			);
		}
	}

	async assertCanRead(agentId: string, userId: string) {
		const role = await this.assertMember(userId);
		const agent = await this.db.agentDefinition.findFirst({
			where: { id: agentId, status: { not: "DELETED" } },
			select: {
				id: true,
				createdById: true,
				status: true,
				currentVersionId: true,
			},
		});

		if (!agent || !canReadAgent(agent.status, agent.createdById, userId)) {
			throw new NotFoundException(`No agent with id ${agentId}.`);
		}

		return {
			...agent,
			role,
			canManage: agent.createdById === userId || isWorkspaceAdmin(role),
		};
	}
}
