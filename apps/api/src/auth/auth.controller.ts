import { type auth, SESSION_COOKIE_NAME } from "@crm/auth";
import { Controller, Get, UseGuards } from "@nestjs/common";
import {
	ApiCookieAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
	OptionalAuth,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import { AuthService } from "./auth.service";
import { SignInAllowedGuard } from "./sign-in-allowed.guard";

type CrmSession = UserSession<typeof auth>;

@ApiTags("Auth")
@ApiCookieAuth(SESSION_COOKIE_NAME)
@Controller("auth")
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Get("me")
	@UseGuards(SignInAllowedGuard)
	@ApiOperation({ summary: "Get the signed-in user's profile" })
	@ApiOkResponse({ description: "The signed-in user's profile." })
	@ApiUnauthorizedResponse({ description: "No valid session." })
	async getMe(@Session() session: CrmSession) {
		return { user: await this.authService.getProfile(session.user.id) };
	}

	@Get("session")
	@OptionalAuth()
	@ApiOperation({
		summary: "Check whether the current request carries a valid session",
	})
	@ApiOkResponse({
		description: "Whether the request is authenticated, and as whom.",
	})
	getSession(@Session() session?: CrmSession) {
		if (!session) {
			return { authenticated: false, user: null };
		}

		return {
			authenticated: true,
			user: { id: session.user.id, email: session.user.email },
			expiresAt: session.session.expiresAt,
		};
	}
}
