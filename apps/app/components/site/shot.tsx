import { cn } from "@crm/ui/lib/utils";
import Image from "next/image";
import { getLocale, getT } from "@/lib/i18n/server";
import { SHOTS, type ShotName, shotSrc } from "./site-config";

const THEME_CLASS = { light: "block dark:hidden", dark: "hidden dark:block" };

export async function Shot({
	name,
	sizes,
	decorative = false,
	eager = false,
	className,
}: {
	name: ShotName;
	sizes: string;
	decorative?: boolean;
	eager?: boolean;
	className?: string;
}) {
	const [t, locale] = await Promise.all([getT(), getLocale()]);
	const { width, height, alt } = SHOTS.images[name];

	return SHOTS.themes.map((theme) => (
		<Image
			key={theme}
			src={shotSrc(name, theme, locale)}
			width={width}
			height={height}
			sizes={sizes}
			alt={decorative ? "" : t(alt)}
			loading={eager ? "eager" : "lazy"}
			className={cn(
				"h-auto max-w-full rounded-(--site-radius-shot) shadow-(--shadow)",
				THEME_CLASS[theme],
				className,
			)}
		/>
	));
}
