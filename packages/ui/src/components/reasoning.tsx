"use client";

import { useUiT } from "@crm/ui/lib/i18n";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Shimmer } from "@crm/ui/components/shimmer";
import { cn } from "@crm/ui/lib/utils";
import type { ReactNode } from "react";

export function Reasoning({
	children,
	className,
	isStreaming = false,
	label = "Reasoning",
}: {
	children: ReactNode;
	className?: string;
	isStreaming?: boolean;
	label?: string;
}) {
	const t = useUiT();
	return (
		<Accordion
			key={isStreaming ? "streaming" : "settled"}
			type="single"
			collapsible
			defaultValue={isStreaming ? "reasoning" : undefined}
			className={cn(className)}
		>
			<AccordionItem value="reasoning">
				<AccordionTrigger variant="subtle">
					{isStreaming ? <Shimmer>{t("Thinking…")}</Shimmer> : label}
				</AccordionTrigger>
				<AccordionContent className="text-muted-foreground">
					{children}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
