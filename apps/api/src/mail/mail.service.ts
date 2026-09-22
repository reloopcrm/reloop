import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { MAIL } from "./mail.config";

export type Mail = {
	to: string;
	subject: string;
	text: string;
	html: string;
};

const resendAnswer = z.object({ id: z.string().optional() });

@Injectable()
export class MailService {
	private readonly logger = new Logger(MailService.name);
	private readonly apiKey = process.env.RESEND_API_KEY?.trim() || undefined;
	private readonly from = process.env.MAIL_FROM?.trim() || undefined;

	get configured(): boolean {
		return this.apiKey !== undefined && this.from !== undefined;
	}

	async send(mail: Mail): Promise<boolean> {
		if (!this.apiKey || !this.from) return false;

		try {
			const response = await fetch(MAIL.resend.url, {
				method: "POST",
				headers: {
					authorization: `Bearer ${this.apiKey}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					from: this.from,
					to: [mail.to],
					subject: mail.subject,
					text: mail.text,
					html: mail.html,
				}),
				signal: AbortSignal.timeout(MAIL.resend.timeoutMs),
			});
			if (!response.ok) {
				this.logger.error({
					message: "Mail was not accepted",
					status: response.status,
				});
				return false;
			}
			resendAnswer.parse(await response.json().catch(() => ({})));
			return true;
		} catch (error) {
			this.logger.error(
				{ message: "Mail was not sent" },
				error instanceof Error ? error.stack : String(error),
			);
			return false;
		}
	}
}
