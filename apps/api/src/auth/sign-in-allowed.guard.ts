import { type auth, isSignInAllowed } from "@crm/auth";
import {
	type CanActivate,
	type ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import type { Request } from "express";

type SessionRequest = Request & { session?: UserSession<typeof auth> | null };

@Injectable()
export class SignInAllowedGuard implements CanActivate {
	async canActivate(context: ExecutionContext): Promise<boolean> {
		const { session } = context.switchToHttp().getRequest<SessionRequest>();

		if (!session?.user) throw new UnauthorizedException();

		if (!(await isSignInAllowed(session.user.email))) {
			throw new ForbiddenException(
				"This account no longer has access to this CRM.",
			);
		}

		return true;
	}
}
