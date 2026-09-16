"use client";

import { useUiT } from "@crm/ui/lib/i18n";
import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const spinnerVariants = cva("shrink-0", {
	variants: {
		size: {
			default: "size-4",
			lg: "size-10",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

function Spinner({
	className,
	size,
	...props
}: React.ComponentProps<"svg"> & VariantProps<typeof spinnerVariants>) {
	const t = useUiT();
	return (
		<svg
			data-slot="spinner"
			role="status"
			aria-label={t("Loading")}
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			className={cn(spinnerVariants({ size }), className)}
			{...props}
		>
			<circle
				cx="12"
				cy="12"
				r="9"
				stroke="currentColor"
				strokeOpacity={0.25}
				strokeWidth={3}
			/>
			<circle
				cx="12"
				cy="12"
				r="9"
				stroke="currentColor"
				strokeWidth={3}
				strokeLinecap="round"
				pathLength={100}
				strokeDasharray="28 72"
				className="animate-spinner-trace motion-reduce:animate-none"
			/>
		</svg>
	);
}

export { Spinner };
