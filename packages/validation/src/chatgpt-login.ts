import { z } from "zod";

export const CHATGPT_LOGIN_STATUSES = [
	"idle",
	"waiting",
	"connected",
	"failed",
	"timeout",
	"cancelled",
	"unavailable",
] as const;

export const chatgptLoginState = z.object({
	status: z.enum(CHATGPT_LOGIN_STATUSES),
	url: z.string().nullable(),
	code: z.string().nullable(),
	alreadyLoggedIn: z.boolean(),
	reason: z.string().nullable(),
	pollMs: z.number(),
});

export type ChatgptLoginState = z.infer<typeof chatgptLoginState>;

export type ChatgptLoginStatus = ChatgptLoginState["status"];
