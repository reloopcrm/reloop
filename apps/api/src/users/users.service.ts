import type { Db } from "@crm/db";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { InjectDatabase } from "../database/database.constants";

const NAME_MAX = 80;

export interface UserOption {
	id: string;
	name: string;
	email: string;
	image: string | null;
}

@Injectable()
export class UsersService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AuthService) private readonly auth: AuthService,
	) {}

	async rename(userId: string, name: string): Promise<UserOption> {
		const cleaned = name.replace(/\s+/g, " ").trim();

		if (cleaned.length === 0) {
			throw new BadRequestException("Enter the name people should see.");
		}

		if (cleaned.length > NAME_MAX) {
			throw new BadRequestException(
				`A name is at most ${NAME_MAX} characters long.`,
			);
		}

		const saved = await this.db.user.update({
			where: { id: userId },
			data: { name: cleaned },
			select: { id: true, name: true, email: true, image: true },
		});

		await this.auth.invalidateProfile(userId);

		return saved;
	}

	async list(): Promise<UserOption[]> {
		return this.db.user.findMany({
			select: { id: true, name: true, email: true, image: true },
			orderBy: [{ name: "asc" }, { email: "asc" }],
		});
	}
}
