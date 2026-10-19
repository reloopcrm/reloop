import { apiUrl, auth, mcpUrl } from "@crm/auth";
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
		sendMetadata(res, await auth.api.getOAuthServerConfig());
	}

	@Get([...MCP.wellKnownRoutes.protectedResource])
	async protectedResource(@Res() res: Response): Promise<void> {
		const { issuer } = await auth.api.getOAuthServerConfig();

		sendMetadata(res, {
			resource: mcpUrl(apiUrl),
			authorization_servers: [issuer],
			scopes_supported: [...MCP.scopes],
			bearer_methods_supported: [...MCP.resource.bearerMethods],
			resource_name: MCP.resource.name,
		});
	}
}
