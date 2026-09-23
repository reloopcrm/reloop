"use client";

import { Loader } from "@crm/ui/components/loader";
import dynamic from "next/dynamic";

const load = () => import("@crm/ui/components/dashboard-chart");

const loading = () => (
	<div className="flex h-[200px] items-center justify-center">
		<Loader />
	</div>
);

export const BarTrend = dynamic(() => load().then((m) => m.BarTrend), {
	ssr: false,
	loading,
});
