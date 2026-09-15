import { openSecret, sealSecret, secretKey } from "@crm/db/secrets";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";

const PURPOSE = "imap-credentials";

export function credentialKey(secret: string): Buffer {
	return secretKey(secret, PURPOSE);
}

export { openSecret, sealSecret };

@Injectable()
export class ImapCredentialService {
	private readonly key: Buffer;

	constructor(config: ConfigService<EnvironmentVariables, true>) {
		this.key = credentialKey(config.get("BETTER_AUTH_SECRET", { infer: true }));
	}

	seal(password: string): string {
		return sealSecret(password, this.key);
	}

	open(sealed: string): string {
		return openSecret(sealed, this.key);
	}
}
