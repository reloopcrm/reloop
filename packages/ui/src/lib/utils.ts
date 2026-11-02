import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: ["2xs", "2sm", "md"],
			shadow: [
				"surface",
				"surface-hover",
				"button",
				"sheet",
				"hairline",
				"inset",
			],
			radius: ["badge"],
			tracking: ["label"],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
