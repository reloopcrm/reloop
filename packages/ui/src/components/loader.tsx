"use client";

import { useUiT } from "@crm/ui/lib/i18n";
import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { useId } from "react";
import { BRAND } from "../lib/brand";
import { WORDMARK_PATH } from "../lib/wordmark-path";

const loaderVariants = cva("w-auto shrink-0", {
	variants: {
		size: {
			default: "h-5",
			lg: "h-8",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

function Loader({
	className,
	size,
	...props
}: React.ComponentProps<"svg"> & VariantProps<typeof loaderVariants>) {
	const t = useUiT();
	const id = useId();
	const clip = `${id}-clip`;
	const sweep = `${id}-sweep`;

	return (
		<svg
			data-slot="loader"
			role="status"
			aria-label={`${BRAND.name}, ${t("Loading")}`}
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 1000 278"
			fill="none"
			className={cn(loaderVariants({ size }), className)}
			{...props}
		>
			<defs>
				<clipPath id={clip}>
					<path d={WORDMARK_PATH} clipRule="evenodd" />
				</clipPath>
				<linearGradient id={sweep} x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stopColor="var(--primary)" stopOpacity="0" />
					<stop offset="0.5" stopColor="var(--primary)" stopOpacity="1" />
					<stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
				</linearGradient>
			</defs>

			<g clipPath={`url(#${clip})`}>
				<rect
					x="0"
					y="0"
					width="1000"
					height="278"
					fill="currentColor"
					fillOpacity="0.2"
				/>
				<rect
					x="0"
					y="0"
					width="440"
					height="278"
					fill={`url(#${sweep})`}
					className="animate-loader-sweep motion-reduce:animate-none"
				/>
			</g>
		</svg>
	);
}

export { Loader };
