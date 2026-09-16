export function plansOffered(): boolean {
	return process.env.RELOOP_PLANS === "true";
}

export function demoOffered(): boolean {
	return process.env.RELOOP_DEMO === "true";
}
