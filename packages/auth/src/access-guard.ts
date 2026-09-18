import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import * as z from "zod";
import { API_KEY_HEADER } from "./api-keys";
import { isOrganizationWrite } from "./organization";
import { isFreshPasswordSession } from "./password-rules";
import { isSignInAllowed } from "./sign-in-grants";
import { slackConnectGuard } from "./slack-connect";

const SSO_REGISTER_PATH = "/sso/register";
const API_KEY_PATH_PREFIX = "/api-key/";

const API_KEY_CREATE_PATH = "/api-key/create";

const ssoRegisterBody = z.object({ organizationId: z.literal(WORKSPACE_ID) });
const chosenKeyPrefix = z.object({ prefix: z.string() });

export const accessGuard = createAuthMiddleware(async (ctx) => {
	const passwordChange =
		ctx.path === "/change-password" || ctx.path === "/set-password";
	if (passwordChange && ctx.headers?.has(API_KEY_HEADER)) {
		throw new APIError("UNAUTHORIZED", {
			message: "Sign out and sign in again before changing your password.",
		});
	}
	if (
		ctx.path.startsWith(API_KEY_PATH_PREFIX) &&
		ctx.headers?.has(API_KEY_HEADER)
	) {
		throw new APIError("UNAUTHORIZED", {
			message: "An API key cannot manage API keys. Sign in to the CRM first.",
		});
	}
	if (
		ctx.path === API_KEY_CREATE_PATH &&
		chosenKeyPrefix.safeParse(ctx.body).success
	) {
		throw new APIError("FORBIDDEN", {
			message: "An API key takes the prefix this CRM gives it.",
		});
	}
	if (ctx.path === SSO_REGISTER_PATH && ctx.headers?.has(API_KEY_HEADER)) {
		throw new APIError("UNAUTHORIZED", {
			message:
				"An API key cannot add a sign-in provider. Sign in to the CRM first.",
		});
	}
	if (
		ctx.path === SSO_REGISTER_PATH &&
		!ssoRegisterBody.safeParse(ctx.body).success
	) {
		throw new APIError("FORBIDDEN", {
			message:
				"Only an owner or an admin adds a sign-in provider, on Settings then SSO.",
		});
	}
	if (isOrganizationWrite(ctx.path)) {
		throw new APIError("FORBIDDEN", {
			message: "Change the workspace on Settings, not through the auth API.",
		});
	}
	const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
	if (session && !(await isSignInAllowed(session.user.email))) {
		throw new APIError("FORBIDDEN", {
			message: "This account no longer has access to this CRM.",
		});
	}
	if (
		passwordChange &&
		(!session || !isFreshPasswordSession(session.session))
	) {
		throw new APIError("FORBIDDEN", {
			message: "Sign out and sign in again before changing your password.",
		});
	}
	await slackConnectGuard(ctx);
});
