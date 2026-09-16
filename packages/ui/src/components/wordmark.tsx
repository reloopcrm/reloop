import type * as React from "react";
import { BRAND } from "../lib/brand";
import { WORDMARK_PATH } from "../lib/wordmark-path";



const Wordmark = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 1000 278"
		width={1000}
		height={278}
		fill="none"
		role="img"
		aria-label={BRAND.name}
		{...props}
	>
		<path d={WORDMARK_PATH} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
	</svg>
);
export default Wordmark;
