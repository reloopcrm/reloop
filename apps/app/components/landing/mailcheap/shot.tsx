import Image from "next/image";
import { SHOTS, type ShotName, shotSrc } from "@/components/site/site-config";
import { getLocale, getT } from "@/lib/i18n/server";

export async function DarkShot({
	name,
	sizes,
	eager = false,
	className,
}: {
	name: ShotName;
	sizes: string;
	eager?: boolean;
	className?: string;
}) {
	const [t, locale] = await Promise.all([getT(), getLocale()]);
	const { width, height, alt } = SHOTS.images[name];

	return (
		<Image
			src={shotSrc(name, "dark", locale)}
			width={width}
			height={height}
			sizes={sizes}
			alt={t(alt)}
			loading={eager ? "eager" : "lazy"}
			className={className}
		/>
	);
}
