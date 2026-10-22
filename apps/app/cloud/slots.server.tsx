import type {
	AppNavSlot,
	DangerZoneProps,
	HostedSignInProps,
	PausedPaymentSectionProps,
} from "@/cloud/contract";

export function PausedPaymentSection(_props: PausedPaymentSectionProps) {
	return null;
}

export function DangerZone(_props: DangerZoneProps) {
	return null;
}

export function AgreementGate() {
	return null;
}

export function HostedSignIn(_props: HostedSignInProps) {
	return null;
}

export async function appNav(): Promise<readonly AppNavSlot[]> {
	return [];
}
