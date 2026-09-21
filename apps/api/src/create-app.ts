import {
	API_KEY_HEADER,
	apiUrl,
	isSignInAllowed,
	SESSION_COOKIE_NAME,
} from "@crm/auth";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
	ExpressAdapter,
	type NestExpressApplication,
} from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { AppRouterHost } from "nestjs-trpc";
import {
	createOpenApiExpressMiddleware,
	generateOpenApiDocument,
} from "trpc-to-openapi";
import { AppModule } from "./app.module";
import { NodeEnv } from "./config/env.validation";
import { REQUEST_SIZE } from "./http/http-config";
import {
	requestSizeLimit,
	trpcBodyLimit,
} from "./http/request-size.middleware";
import { ContextLogger } from "./logging/context-logger";
import { tenantMiddleware } from "./tenancy/tenant.middleware";
import { REST } from "./trpc/openapi";
import { createBaseTrpcContext } from "./trpc/trpc.context";

type OpenApiDocument = ReturnType<typeof generateOpenApiDocument>;

type OpenApiDocumentFactory = () => OpenApiDocument;

const REST_DESCRIPTION =
	"Every tRPC procedure, reachable over REST for tooling that cannot speak tRPC. Same validation, same middlewares, same services as the tRPC transport. Send an API key in the x-api-key header, or a session cookie.";

export async function createApp(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule,
		new ExpressAdapter(),
		{ bodyParser: false, logger: new ContextLogger() },
	);

	app.use(requestSizeLimit());
	app.use(REQUEST_SIZE.trpc.path, trpcBodyLimit());
	app.use(helmet());
	app.use(tenantMiddleware());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	let restBridge: ((req: Request, res: Response) => Promise<void>) | undefined;
	for (const mount of REST.bridge.mounts) {
		app.use(mount, (req: Request, res: Response, next: NextFunction) => {
			if (!restBridge) {
				next();
				return;
			}
			void restBridge(req, res);
		});
	}

	let openApiDocument: OpenApiDocumentFactory | undefined;
	app.use(
		REST.document.path,
		(req: Request, res: Response, next: NextFunction) => {
			if (!openApiDocument) {
				next();
				return;
			}
			void serveOpenApiDocument(req, res, openApiDocument).catch(() => {
				res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
			});
		},
	);

	const apiKeySecurityScheme = {
		type: "apiKey",
		in: "header",
		name: API_KEY_HEADER,
	} as const;

	if (process.env.NODE_ENV !== NodeEnv.Production) {
		// SwaggerModule.setup() registers its Express routes synchronously, so it must
		// happen before app.init() the same way the REST bridge does — Nest's own
		// routing (wired up during init) otherwise shadows anything registered after
		// it. The factory form defers building the document (which needs the tRPC
		// router, only available post-init) to first request instead.
		SwaggerModule.setup(
			"",
			app,
			() => {
				const { appRouter } = app.get(AppRouterHost);

				const trpcDocument = generateOpenApiDocument(appRouter, {
					title: "CRM API — tRPC bridge",
					description:
						"Every tRPC procedure, reachable over REST for tooling that cannot speak tRPC. Same validation, same middlewares, same services as the tRPC transport — this only translates the wire format.",
					version: "1.0",
					baseUrl: `${apiUrl}${REST.bridge.baseUrl}`,
					securitySchemes: { apiKey: apiKeySecurityScheme },
				});

				const swaggerConfig = new DocumentBuilder()
					.setTitle("CRM API")
					.setDescription(
						`REST surface of the CRM API: auth, health, the internal cron routes, and a generated REST bridge (under ${REST.bridge.baseUrl}) for every tRPC procedure.`,
					)
					.setVersion("1.0")
					.addCookieAuth(SESSION_COOKIE_NAME)
					.addApiKey(apiKeySecurityScheme, "apiKey")
					.build();
				const swaggerDocument = SwaggerModule.createDocument(
					app,
					swaggerConfig,
				);

				swaggerDocument.paths = {
					...swaggerDocument.paths,
					...(trpcDocument.paths as typeof swaggerDocument.paths),
				};
				swaggerDocument.components = {
					...swaggerDocument.components,
					schemas: {
						...swaggerDocument.components?.schemas,
						...(trpcDocument.components?.schemas as NonNullable<
							typeof swaggerDocument.components
						>["schemas"]),
					},
				};

				return swaggerDocument;
			},
			{ jsonDocumentUrl: "openapi.json" },
		);
	}

	await app.init();

	const { appRouter } = app.get(AppRouterHost);

	restBridge = createOpenApiExpressMiddleware({
		router: appRouter,
		maxBodySize: REQUEST_SIZE.body.maxBytes,
		createContext: ({ req }) => createBaseTrpcContext(req),
	});

	let built: OpenApiDocument | undefined;
	openApiDocument = () =>
		(built ??= generateOpenApiDocument(appRouter, {
			title: "CRM REST API",
			description: REST_DESCRIPTION,
			version: "1.0",
			baseUrl: `${apiUrl}${REST.bridge.baseUrl}`,
			securitySchemes: { apiKey: apiKeySecurityScheme },
		}));

	return app;
}

async function serveOpenApiDocument(
	req: Request,
	res: Response,
	document: OpenApiDocumentFactory,
): Promise<void> {
	const { session } = await createBaseTrpcContext(req);

	if (!session?.user || !(await isSignInAllowed(session.user.email))) {
		res.status(401).json({ message: "UNAUTHORIZED" });
		return;
	}

	res.json(document());
}
