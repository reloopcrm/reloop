import { z } from "zod";

export const waitlistJoinInput = z.object({
	email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

export type WaitlistJoinInput = z.infer<typeof waitlistJoinInput>;
