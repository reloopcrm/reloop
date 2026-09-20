export function SectionHeading({
	title,
	lede,
}: {
	title: string;
	lede?: string;
}) {
	return (
		<div className="flex max-w-(--container-page) flex-col gap-4">
			<h2 className="text-balance font-semibold text-4xl/[42px] tracking-tight md:text-[44px]/[50px]">
				{title}
			</h2>
			{lede ? (
				<p className="text-muted-foreground text-lg/[29px]">{lede}</p>
			) : null}
		</div>
	);
}
