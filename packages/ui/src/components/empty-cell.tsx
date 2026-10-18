import { cn } from "../lib/utils";

export function EmptyCellValue({ className }: { className?: string }) {
	return <span className={cn("text-faint-foreground", className)}>·</span>;
}
