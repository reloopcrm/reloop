import { BRAND } from "@crm/ui/lib/brand";
import { WORDMARK_PATH } from "@crm/ui/lib/wordmark-path";
import { ImageResponse } from "next/og";
import { getT } from "@/lib/i18n/server";

export const alt = `${BRAND.name}: ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
	const t = await getT();
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background: "#08090a",
				padding: "72px",
			}}
		>
			<svg width="420" height="117" viewBox="0 0 1000 278" aria-hidden="true">
				<path d={WORDMARK_PATH} fill="#f7f8f8" fillRule="evenodd" />
			</svg>

			<div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
				<div
					style={{
						color: "#f7f8f8",
						fontSize: "64px",
						lineHeight: 1.1,
						letterSpacing: "-0.02em",
						maxWidth: "900px",
					}}
				>
					{t(BRAND.tagline)}
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
					<div
						style={{
							width: "56px",
							height: "6px",
							borderRadius: "3px",
							background: "#e4f222",
						}}
					/>
					<div style={{ color: "#8a8f98", fontSize: "30px" }}>
						{t("The open-source, self-hosted CRM")}
					</div>
				</div>
			</div>
		</div>,
		size,
	);
}
