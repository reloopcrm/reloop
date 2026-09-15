import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { API_KEY_HEADER } from "./api-keys";
import { isFreshPasswordSession } from "./password-rules";
import { slackConnectGuard } from "./slack-connect";
import { isWorkspaceEmail } from "./workspace";

export const accessGuard = createAuthMiddleware(async (ctx) => {
	const passwordChange =
		ctx.path === "/change-password" || ctx.path === "/set-password";
	if (passwordChange && ctx.headers?.has(API_KEY_HEADER)) {
		throw new APIError("UNAUTHORIZED", {
			message: "Sign out and sign in again before changing your password.",
		});
	}
	const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
	if (session && !isWorkspaceEmail(session.user.email)) {
		throw new APIError("FORBIDDEN", {
			message: "This account no longer has access to this CRM.",
		});
	}
	if (
		passwordChange &&
		(!session || !isFreshPasswordSession(session.session.createdAt))
	) {
		throw new APIError("FORBIDDEN", {
			message: "Sign out and sign in again before changing your password.",
		});
	}
	await slackConnectGuard(ctx);
});
