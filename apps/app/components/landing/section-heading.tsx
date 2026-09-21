import { Display } from "@crm/ui/components/display";

export function SectionHeading({
	title,
	lede,
}: {
	title: string;
	lede?: string;
}) {
	return (
		<div className="flex w-full flex-col items-center gap-6 text-center">
			<Display size="title" asChild>
				<h2 className="max-w-(--container-page)">{title}</h2>
			</Display>
			{lede ? (
				<p className="max-w-(--container-sheet) text-pretty text-body-foreground text-lg md:text-xl">
					{lede}
				</p>
			) : null}
		</div>
	);
}
