import {
	auth,
	mcpAddress,
	mcpIssuer,
	scopeAuthorizationServer,
} from "@crm/auth";
import { Controller, Get, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { MCP } from "./mcp.config";

type AuthorizationServerMetadata = Awaited<
	ReturnType<typeof auth.api.getOAuthServerConfig>
>;

type ProtectedResourceMetadata = {
	resource: string;
	authorization_servers: string[];
	scopes_supported: string[];
	bearer_methods_supported: string[];
	resource_name: string;
};

function sendMetadata(
	res: Response,
	body: AuthorizationServerMetadata | ProtectedResourceMetadata,
): void {
	res
		.set(MCP.http.allowOriginHeader, MCP.http.allowOrigin)
		.set(MCP.http.cacheControlHeader, MCP.http.cacheControl)
		.json(body);
}

@ApiExcludeController()
@AllowAnonymous()
@Controller()
export class WellKnownController {
	@Get([...MCP.wellKnownRoutes.authorizationServer])
	async authorizationServer(@Res() res: Response): Promise<void> {
		sendMetadata(
			res,
			scopeAuthorizationServer(
				await auth.api.getOAuthServerConfig(),
				mcpIssuer(),
			),
		);
	}

	@Get([...MCP.wellKnownRoutes.protectedResource])
	protectedResource(@Res() res: Response): void {
		sendMetadata(res, {
			resource: mcpAddress(),
			authorization_servers: [mcpIssuer()],
			scopes_supported: [...MCP.scopes],
			bearer_methods_supported: [...MCP.resource.bearerMethods],
			resource_name: MCP.resource.name,
		});
	}
}
