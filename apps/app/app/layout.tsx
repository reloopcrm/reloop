import { BRAND } from "@crm/ui/lib/brand";
import "@crm/ui/globals.css";
import { Toaster } from "@crm/ui/components/sonner";
import { TooltipProvider } from "@crm/ui/components/tooltip";
import { cn } from "@crm/ui/lib/utils";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SITE_FONTS } from "@/components/site/fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { siteAddress } from "@/lib/site-address";
import { TRPCReactProvider } from "@/lib/trpc/client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();

	const description = `${BRAND.name}: ${t(BRAND.tagline)}`;

	return {
		...metadata,
		description,
		openGraph: {
			type: "website",
			siteName: BRAND.name,
			title: BRAND.name,
			description,
		},
		twitter: {
			card: "summary_large_image",
			title: BRAND.name,
			description,
		},
	};
}

const metadata: Metadata = {
	metadataBase: siteAddress(),
	title: {
		default: BRAND.name,
		template: `%s · ${BRAND.name}`,
	},
	icons: {
		icon: [
			{ url: "/favicon.svg", type: "image/svg+xml" },
			{ url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
		],
		apple: "/apple-touch-icon.png",
	},
	manifest: "/site.webmanifest",
	verification: process.env.GOOGLE_SITE_VERIFICATION
		? { google: process.env.GOOGLE_SITE_VERIFICATION }
		: undefined,
};

export const instant = false;

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const locale = await getLocale();

	return (
		<html
			lang={locale}
			suppressHydrationWarning
			className={cn(SITE_FONTS, "h-full antialiased")}
		>
			<body className="flex min-h-full flex-col font-sans">
				<I18nProvider locale={locale} dictionary={getDictionary(locale)}>
					<NuqsAdapter>
						<TRPCReactProvider>
							<ThemeProvider>
								<TooltipProvider>{children}</TooltipProvider>
								<Toaster richColors />
							</ThemeProvider>
						</TRPCReactProvider>
					</NuqsAdapter>
				</I18nProvider>
			</body>
		</html>
	);
}
