import { z } from "zod";

export const winBackLaterMeta = z.object({
	winBack: z.literal(true),
	later: z.literal(true),
});

export type WinBackLaterMeta = z.infer<typeof winBackLaterMeta>;

export function isWinBackSnooze(meta: unknown): boolean {
	return winBackLaterMeta.safeParse(meta).success;
}
