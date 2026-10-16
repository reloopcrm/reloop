import {
	BadRequestException,
	HttpException,
	HttpStatus,
	NotFoundException,
	UnauthorizedException,
} from "@nestjs/common";
import type { APIError } from "better-auth/api";

export function apiKeyException(error: APIError): HttpException {
	const code = error.body?.code;
	const message = error.body?.message;

	switch (code) {
		case "KEY_NOT_FOUND":
			return new NotFoundException(
				"That API key no longer exists. Reload the page.",
			);
		case "EXPIRES_IN_IS_TOO_SMALL":
		case "EXPIRES_IN_IS_TOO_LARGE":
		case "KEY_DISABLED_EXPIRATION":
			return new BadRequestException(
				"Pick one of the expiry options for the key.",
			);
		case "INVALID_NAME_LENGTH":
			return new BadRequestException(
				"That key name is too long. Use a shorter one.",
			);
		case "NAME_REQUIRED":
			return new BadRequestException("Give the key a name.");
		case "RATE_LIMIT_EXCEEDED":
			return new HttpException(
				"Too many tries. Wait a minute, then try again.",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		case "UNAUTHORIZED_SESSION":
			return new UnauthorizedException(
				"Sign in again to manage your API keys.",
			);
	}

	if (code === undefined && message) {
		return new HttpException(message, error.statusCode);
	}

	return new HttpException("The API key could not be saved.", error.statusCode);
}
