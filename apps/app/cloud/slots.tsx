import type {
	CheckoutBannerProps,
	CheckoutButtonProps,
	CheckoutNotice,
	CheckoutNoticeInput,
	CheckoutUrl,
} from "@/cloud/contract";

export function checkoutNotice(_input: CheckoutNoticeInput): CheckoutNotice {
	return null;
}

export function UsageAddOns() {
	return null;
}

export function CheckoutBanner(_props: CheckoutBannerProps) {
	return null;
}

export function CheckoutButton(_props: CheckoutButtonProps) {
	return null;
}

export function CheckoutOutcome() {
	return null;
}

export function useCheckoutUrl(): CheckoutUrl {
	return async (_wanted, fallback) => fallback;
}
