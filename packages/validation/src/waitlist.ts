import { z } from "zod";

export const waitlistJoinInput = z.object({
	email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

export const waitlistConfirmInput = z.object({
	token: z.string().trim().min(32).max(128),
});

export type WaitlistJoinInput = z.infer<typeof waitlistJoinInput>;

export type WaitlistConfirmInput = z.infer<typeof waitlistConfirmInput>;
