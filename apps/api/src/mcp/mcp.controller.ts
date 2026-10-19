import type { Db } from "@crm/db";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	Controller,
	Delete,
	Get,
	HttpStatus,
	Logger,
	Post,
	Req,
	Res,
	UseFilters,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { InjectDatabase } from "../database/database.constants";
import { REST_RATE_LIMIT } from "../http/http-config";
import {
	countRestRequest,
	restRatePruner,
} from "../http/rest-rate-limit.middleware";
import { MCP } from "./mcp.config";
import { resolveMcpCaller } from "./mcp-caller";
import {
	jsonRpcError,
	McpCredentialErrorFilter,
	sendUnauthorized,
} from "./mcp-challenge";
import { McpServerFactory } from "./mcp-server";

@ApiExcludeController()
@AllowAnonymous()
@UseFilters(McpCredentialErrorFilter)
@Controller()
export class McpController {
	private readonly logger = new Logger(McpController.name);
	private readonly prune: (now: number) => Promise<void>;

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly servers: McpServerFactory,
	) {
		this.prune = restRatePruner(MCP.rateLimit, db);
	}

	@Post(MCP.path)
	async post(@Req() req: Request, @Res() res: Response): Promise<void> {
		const caller = await resolveMcpCaller(req, this.db);
		if (!caller) {
			sendUnauthorized(res);
			return;
		}

		if (caller.limitKey) {
			const now = Date.now();
			await this.prune(now);
			const decision = await countRestRequest(
				this.db,
				caller.limitKey,
				MCP.rateLimit,
				now,
			);
			if (!decision.allowed) {
				res
					.status(HttpStatus.TOO_MANY_REQUESTS)
					.set(
						REST_RATE_LIMIT.retryAfterHeader,
						String(decision.retryAfterSeconds),
					)
					.json(jsonRpcError(MCP.jsonRpc.tooManyRequests));
				return;
			}
		}

		const server = this.servers.build(caller);
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		res.on("close", () => {
			void transport.close();
			void server.close();
		});

		try {
			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			this.logger.error(
				{ message: "MCP request failed", userId: caller.userId },
				error instanceof Error ? error.stack : undefined,
			);
			if (!res.headersSent) {
				res
					.status(HttpStatus.INTERNAL_SERVER_ERROR)
					.json(jsonRpcError(MCP.jsonRpc.internal));
			}
		}
	}

	@Get(MCP.path)
	get(@Res() res: Response): void {
		this.notAllowed(res);
	}

	@Delete(MCP.path)
	delete(@Res() res: Response): void {
		this.notAllowed(res);
	}

	private notAllowed(res: Response): void {
		res
			.status(HttpStatus.METHOD_NOT_ALLOWED)
			.set(MCP.http.allowHeader, MCP.http.allow)
			.json(jsonRpcError(MCP.jsonRpc.methodNotAllowed));
	}
}
