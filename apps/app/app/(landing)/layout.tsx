import "@crm/ui/site.css";
import { cn } from "@crm/ui/lib/utils";
import { SITE_FONTS } from "@/components/site/fonts";

export default function LandingLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return <div className={cn(SITE_FONTS, "contents")}>{children}</div>;
}
