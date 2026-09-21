export class RateLimiter {
	private readonly hits = new Map<string, { count: number; until: number }>();

	constructor(private readonly windowMs: number) {}

	take(key: string, limit: number, now = Date.now()): boolean {
		if (this.hits.size > 10_000) this.prune(now);
		const hit = this.hits.get(key);
		if (!hit || hit.until <= now) {
			this.hits.set(key, { count: 1, until: now + this.windowMs });
			return true;
		}
		hit.count += 1;
		return hit.count <= limit;
	}

	private prune(now: number): void {
		for (const [key, hit] of this.hits) {
			if (hit.until <= now) this.hits.delete(key);
		}
	}
}
