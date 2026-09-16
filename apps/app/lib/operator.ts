export function plansOffered(): boolean {
	return process.env.RELOOP_PLANS === "true";
}
