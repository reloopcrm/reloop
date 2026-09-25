export function plansOffered(): boolean {
	return process.env.RELOOP_PLANS === "true";
}

export function managedInstall(): boolean {
	return process.env.RELOOP_MANAGED === "true";
}

export function demoOffered(): boolean {
	return process.env.RELOOP_DEMO === "true";
}

export function deletionZoneShown(input: {
	hostedCustomer: boolean;
	owner: boolean;
}): boolean {
	return input.hostedCustomer && input.owner;
}
