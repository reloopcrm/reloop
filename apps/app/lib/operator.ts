export function plansOffered(): boolean {
	return process.env.RELOOP_PLANS === "true";
}

export function managedInstall(): boolean {
	return process.env.RELOOP_MANAGED === "true";
}

export function demoOffered(): boolean {
	return process.env.RELOOP_DEMO === "true";
}
