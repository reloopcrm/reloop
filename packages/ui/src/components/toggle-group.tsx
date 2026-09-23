"use client";

import { toggleVariants } from "@crm/ui/components/toggle";
import { cn } from "@crm/ui/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

const SEGMENT_GAP = 0.5;

const ToggleGroupContext = React.createContext<
	VariantProps<typeof toggleVariants> & {
		spacing?: number;
		orientation?: "horizontal" | "vertical";
	}
>({
	size: "default",
	variant: "default",
	spacing: SEGMENT_GAP,
	orientation: "horizontal",
});

function ToggleGroup({
	className,
	variant,
	size,
	spacing = SEGMENT_GAP,
	orientation = "horizontal",
	wrap = false,
	children,
	...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
	VariantProps<typeof toggleVariants> & {
		spacing?: number;
		orientation?: "horizontal" | "vertical";
		wrap?: boolean;
	}) {
	const context = React.useMemo(
		() => ({ variant, size, spacing, orientation }),
		[variant, size, spacing, orientation],
	);

	return (
		<ToggleGroupPrimitive.Root
			data-slot="toggle-group"
			data-variant={variant}
			data-size={size}
			data-spacing={spacing}
			data-orientation={orientation}
			data-wrap={wrap ? "" : undefined}
			style={
				{ "--gap": Math.max(spacing, SEGMENT_GAP) } as React.CSSProperties
			}
			className={cn(
				"group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-full border bg-card p-0.75 data-vertical:w-full data-vertical:flex-col data-vertical:items-stretch data-vertical:rounded-lg data-[wrap]:w-full data-[wrap]:flex-wrap data-[wrap]:rounded-lg",
				className,
			)}
			{...props}
		>
			<ToggleGroupContext.Provider value={context}>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive.Root>
	);
}

function ToggleGroupItem({
	className,
	children,
	variant = "default",
	size = "default",
	...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
	VariantProps<typeof toggleVariants>) {
	const context = React.useContext(ToggleGroupContext);
	const resolved = context.variant || variant;

	return (
		<ToggleGroupPrimitive.Item
			data-slot="toggle-group-item"
			data-variant={resolved}
			data-size={context.size || size}
			data-spacing={context.spacing}
			className={cn(
				toggleVariants({
					variant: resolved,
					size: context.size || size,
				}),
				"shrink-0 rounded-full border-0 focus:z-10 focus-visible:z-10",
				resolved !== "quiet" &&
					"data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</ToggleGroupPrimitive.Item>
	);
}

export { ToggleGroup, ToggleGroupItem };
