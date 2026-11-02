import Image from "next/image";
import { SHOTS, type ShotName, shotSrc } from "@/components/site/site-config";
import { getLocale, getT } from "@/lib/i18n/server";

export async function Shot({
	name,
	sizes,
	eager = false,
}: {
	name: ShotName;
	sizes: string;
	eager?: boolean;
}) {
	const [t, locale] = await Promise.all([getT(), getLocale()]);
	const { width, height, alt } = SHOTS.images[name];
	const loading = eager ? "eager" : "lazy";

	return (
		<>
			<Image
				src={shotSrc(name, "light", locale)}
				width={width}
				height={height}
				sizes={sizes}
				alt={t(alt)}
				loading={loading}
				className="dark:hidden"
			/>
			<Image
				src={shotSrc(name, "dark", locale)}
				width={width}
				height={height}
				sizes={sizes}
				alt={t(alt)}
				loading={loading}
				className="hidden dark:block"
			/>
		</>
	);
}
