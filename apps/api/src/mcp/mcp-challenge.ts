import { protectedResourceMetadataUrl } from "@crm/auth";
import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	HttpStatus,
} from "@nestjs/common";
import { APIError } from "better-auth/api";
import type { ErrorRequestHandler, Response } from "express";
import { z } from "zod";
import { MCP } from "./mcp.config";

type JsonRpcError = { readonly code: number; readonly message: string };

export function jsonRpcError(error: JsonRpcError) {
	return {
		jsonrpc: MCP.jsonRpc.version,
		error: { code: error.code, message: error.message },
		id: null,
	};
}

export function sendUnauthorized(res: Response): void {
	res
		.status(HttpStatus.UNAUTHORIZED)
		.set(
			MCP.http.wwwAuthenticateHeader,
			`Bearer resource_metadata="${protectedResourceMetadataUrl()}"`,
		)
		.set(MCP.http.exposeHeadersHeader, MCP.http.wwwAuthenticateHeader)
		.json(jsonRpcError(MCP.jsonRpc.unauthorized));
}

const bodyParserError = z.object({ type: z.string(), status: z.number() });

export function mcpBodyError(): ErrorRequestHandler {
	return (error, _req, res, next) => {
		const parsed = bodyParserError.safeParse(error);
		if (!parsed.success || res.headersSent) {
			next(error);
			return;
		}

		const failure =
			parsed.data.type === MCP.jsonRpc.parseError.bodyParserType
				? MCP.jsonRpc.parseError
				: MCP.jsonRpc.invalidBody;
		res.status(parsed.data.status).json(jsonRpcError(failure));
	};
}

@Catch(APIError)
export class McpCredentialErrorFilter implements ExceptionFilter {
	catch(_exception: APIError, host: ArgumentsHost): void {
		const res = host.switchToHttp().getResponse<Response>();
		if (res.headersSent) return;

		sendUnauthorized(res);
	}
}
