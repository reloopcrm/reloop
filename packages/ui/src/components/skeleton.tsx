import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const skeletonVariants = cva(
	"animate-pulse rounded-sm motion-reduce:animate-none",
	{
		variants: {
			tone: {
				muted: "bg-muted",
				accent: "bg-accent",
			},
		},
		defaultVariants: {
			tone: "muted",
		},
	},
);

function Skeleton({
	className,
	tone,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
	return (
		<div
			data-slot="skeleton"
			className={cn(skeletonVariants({ tone }), className)}
			{...props}
		/>
	);
}

export { Skeleton };
